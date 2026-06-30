package keeper_test

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/math"
	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"
	"cosmossdk.io/log"

	"marketplace/x/crosschain/keeper"
	"marketplace/x/crosschain/types"
)

type fixture struct {
	ctx    sdk.Context
	k      keeper.Keeper
	codec  address.Codec
	bank   *mockBankKeeper
}

type mockBankKeeper struct {
	balances map[string]sdk.Coins
}

func (m mockBankKeeper) SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins {
	if coins, ok := m.balances[addr.String()]; ok {
		return coins
	}
	return sdk.NewCoins()
}

func (m mockBankKeeper) SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	key := senderAddr.String()
	if m.balances[key] == nil {
		m.balances[key] = sdk.NewCoins()
	}
	if !m.balances[key].IsAllGTE(amt) {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = m.balances[key].Sub(amt...)
	modKey := authtypes.NewModuleAddress(recipientModule).String()
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	m.balances[modKey] = m.balances[modKey].Add(amt...)
	return nil
}

func (m mockBankKeeper) SendCoinsFromModuleToAccount(ctx context.Context, module string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modKey := authtypes.NewModuleAddress(module).String()
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	if !m.balances[modKey].IsAllGTE(amt) {
		return fmt.Errorf("insufficient module funds")
	}
	m.balances[modKey] = m.balances[modKey].Sub(amt...)
	recKey := recipient.String()
	if m.balances[recKey] == nil {
		m.balances[recKey] = sdk.NewCoins()
	}
	m.balances[recKey] = m.balances[recKey].Add(amt...)
	return nil
}

type mockStakingKeeper struct{}

func (m mockStakingKeeper) GetValidator(ctx context.Context, addr sdk.ValAddress) (stakingtypes.Validator, error) {
	return stakingtypes.Validator{}, fmt.Errorf("validator not found")
}
func (m mockStakingKeeper) GetValidatorByConsAddr(ctx context.Context, consAddr sdk.ConsAddress) (stakingtypes.Validator, error) {
	return stakingtypes.Validator{}, fmt.Errorf("validator not found")
}

type mockIBCTransferKeeper struct{}
func (m mockIBCTransferKeeper) Transfer(ctx context.Context, msg *ibctransfertypes.MsgTransfer) (*ibctransfertypes.MsgTransferResponse, error) {
	return &ibctransfertypes.MsgTransferResponse{}, nil
}

type mockIBCClientKeeper struct{}
func (m mockIBCClientKeeper) Route(ctx sdk.Context, clientID string) (ibcexported.LightClientModule, error) {
	return nil, fmt.Errorf("client not found")
}

type mockAccountKeeper struct{}
func (m mockAccountKeeper) GetAccount(ctx context.Context, addr sdk.AccAddress) sdk.AccountI { return nil }

func initFixture(t *testing.T) *fixture {
	t.Helper()
	protoCdc := cdctypes.NewInterfaceRegistry()
	codec := codec.NewProtoCodec(protoCdc)
	addressCdc := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	bank := &mockBankKeeper{balances: make(map[string]sdk.Coins)}
	k, err := keeper.NewKeeper(
		codec,
		storeService,
		log.NewNopLogger(),
		mockAccountKeeper{},
		bank,
		mockIBCTransferKeeper{},
		mockStakingKeeper{},
		mockIBCClientKeeper{},
	)
	require.NoError(t, err)
	defaultParams := types.Params{
		AdminAddress:          authtypes.NewModuleAddress(types.ModuleName).String(),
		SupportedChains:       []string{"osmosis"},
		MinTransferAmount:     1,
		MaxTransferAmount:     1000000,
		TransferTimeoutBlocks: 1000,
	}
	require.NoError(t, k.Params.Set(ctx, defaultParams))
	require.NoError(t, k.BridgeState.Set(ctx, types.BridgeState{NextTransferId: 1}))

	return &fixture{ctx: ctx, k: k, codec: addressCdc, bank: bank}
}

func TestInitiateBridgeTransfer(t *testing.T) {
	testSender := sdk.AccAddress([]byte("test_address_______")).String()

	tests := []struct {
		name      string
		setup     func(*fixture)
		msg       *types.MsgInitiateBridgeTransfer
		expectErr bool
		errSubstr string
	}{
		{
			name: "success",
			setup: func(f *fixture) {
				f.bank.balances[testSender] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))
			},
			msg: &types.MsgInitiateBridgeTransfer{
				Sender: testSender, Recipient: "recipient",
				Amount: sdk.NewCoin("uatom", math.NewInt(500)), DestinationChain: "osmosis",
			},
		},
		{
			name: "insufficient balance",
			msg: &types.MsgInitiateBridgeTransfer{
				Sender: testSender, Recipient: "recipient",
				Amount: sdk.NewCoin("uatom", math.NewInt(500)), DestinationChain: "osmosis",
			},
			expectErr: true, errSubstr: "insufficient",
		},
		{
			name: "unsupported chain",
			setup: func(f *fixture) {
				f.bank.balances[testSender] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))
			},
			msg: &types.MsgInitiateBridgeTransfer{
				Sender: testSender, Recipient: "recipient",
				Amount: sdk.NewCoin("uatom", math.NewInt(500)), DestinationChain: "unknown",
			},
			expectErr: true, errSubstr: "invalid destination chain",
		},
		{
			name: "zero amount",
			setup: func(f *fixture) {
				f.bank.balances[testSender] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))
			},
			msg: &types.MsgInitiateBridgeTransfer{
				Sender: testSender, Recipient: "recipient",
				Amount: sdk.NewCoin("uatom", math.NewInt(0)), DestinationChain: "osmosis",
			},
			expectErr: true, errSubstr: "invalid transfer amount",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := initFixture(t)
			if tc.setup != nil {
				tc.setup(f)
			}
			id, err := f.k.InitiateBridgeTransfer(f.ctx, tc.msg)
			if tc.expectErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.errSubstr)
				assert.Equal(t, uint64(0), id)
			} else {
				assert.NoError(t, err)
				_, err := f.k.BridgeTransfers.Get(f.ctx, id)
				assert.NoError(t, err)
			}
		})
	}
}

func TestCompleteBridgeTransfer(t *testing.T) {
	tests := []struct {
		name      string
		setup     func(*fixture)
		msg       *types.MsgCompleteBridgeTransfer
		expectErr bool
		errSubstr string
	}{
		{
			name: "not found",
			msg: &types.MsgCompleteBridgeTransfer{TransferId: 999, Validator: "validator", Proof: "proof"},
			expectErr: true, errSubstr: "transfer not found",
		},
		{
			name: "already completed",
			setup: func(f *fixture) {
				f.k.SetBridgeTransfer(f.ctx, types.BridgeTransfer{Id: 2, Sender: "s", Recipient: "r", Amount: &sdk.Coin{Denom: "uatom", Amount: math.NewInt(500)}, Status: "completed"})
			},
			msg: &types.MsgCompleteBridgeTransfer{TransferId: 2, Validator: "validator", Proof: "proof"},
			expectErr: true, errSubstr: "already completed",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := initFixture(t)
			if tc.setup != nil {
				tc.setup(f)
			}
			err := f.k.CompleteBridgeTransfer(f.ctx, tc.msg)
			if tc.expectErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.errSubstr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetSetBridgeTransfer(t *testing.T) {
	f := initFixture(t)
	_, err := f.k.GetBridgeTransfer(f.ctx, 999)
	assert.Error(t, err)

	transfer := types.BridgeTransfer{Id: 1, Sender: "s", Recipient: "r", Amount: &sdk.Coin{Denom: "uatom", Amount: math.NewInt(500)}, Status: "pending"}
	assert.NoError(t, f.k.SetBridgeTransfer(f.ctx, transfer))
	got, err := f.k.GetBridgeTransfer(f.ctx, 1)
	assert.NoError(t, err)
	assert.Equal(t, transfer, got)
}

func TestGetSetBridgeState(t *testing.T) {
	f := initFixture(t)
	state, err := f.k.GetBridgeState(f.ctx)
	assert.NoError(t, err)
	assert.Equal(t, uint64(1), state.NextTransferId)

	newState := types.BridgeState{NextTransferId: 5, PendingTransfers: []*types.BridgeTransfer{{Id: 1, Sender: "s", Recipient: "r", Status: "pending"}}}
	assert.NoError(t, f.k.SetBridgeState(f.ctx, newState))
	got, err := f.k.GetBridgeState(f.ctx)
	assert.NoError(t, err)
	assert.Equal(t, uint64(5), got.NextTransferId)
	assert.Len(t, got.PendingTransfers, 1)
}

func TestPruneOldTransfers(t *testing.T) {
	f := initFixture(t)
	state := types.BridgeState{
		NextTransferId: 10,
		CompletedTransfers: []*types.BridgeTransfer{
			{Id: 1, Sender: "s1", Recipient: "r1", Status: "completed"},
			{Id: 2, Sender: "s2", Recipient: "r2", Status: "completed"},
			{Id: 3, Sender: "s3", Recipient: "r3", Status: "completed"},
		},
	}
	assert.NoError(t, f.k.SetBridgeState(f.ctx, state))

	pruned, err := f.k.PruneOldTransfers(f.ctx, 2)
	assert.NoError(t, err)
	assert.Equal(t, uint64(1), pruned)

	got, _ := f.k.GetBridgeState(f.ctx)
	assert.Len(t, got.CompletedTransfers, 2)
}

func TestChainRouteCRUD(t *testing.T) {
	f := initFixture(t)
	route := types.ChainRoute{ChainID: "osmosis-1", ChannelID: "channel-0", PortID: "transfer"}
	assert.NoError(t, f.k.SetChainRoute(f.ctx, "osmosis", route))
	got, err := f.k.GetChainRoute(f.ctx, "osmosis")
	assert.NoError(t, err)
	assert.Equal(t, route, got)
	_, err = f.k.GetChainRoute(f.ctx, "juno")
	assert.Error(t, err)
}

func TestGenesisRoundTrip(t *testing.T) {
	f := initFixture(t)
	gen := types.DefaultGenesisState()
	gen.Params.SupportedChains = []string{"osmosis"}
	gen.Params.MinTransferAmount = 1000
	gen.BridgeState.NextTransferId = 42
	gen.BridgeState.PendingTransfers = []*types.BridgeTransfer{{Id: 1, Sender: "s", Recipient: "r", Status: "pending"}}

	f.k.InitGenesis(f.ctx, *gen)
	exported, err := f.k.ExportGenesis(f.ctx)
	require.NoError(t, err)

	assert.Equal(t, gen.Params.SupportedChains, exported.Params.SupportedChains)
	assert.Equal(t, uint64(42), exported.BridgeState.NextTransferId)
	assert.Len(t, exported.BridgeState.PendingTransfers, 1)
}

func TestFormatParseBridgeMemo(t *testing.T) {
	assert.Equal(t, "crosschain:1", types.FormatBridgeMemo(1))
	assert.Equal(t, "crosschain:12345", types.FormatBridgeMemo(12345))

	id, ok := types.ParseBridgeMemo("crosschain:123")
	assert.True(t, ok)
	assert.Equal(t, uint64(123), id)

	_, ok = types.ParseBridgeMemo("other:123")
	assert.False(t, ok)
	_, ok = types.ParseBridgeMemo("")
	assert.False(t, ok)
	_, ok = types.ParseBridgeMemo("crosschain:abc")
	assert.False(t, ok)
}

func TestEndBlockerTimeout(t *testing.T) {
	f := initFixture(t)
	sender := sdk.AccAddress([]byte("test_address_______")).String()
	assert.NoError(t, f.k.SetBridgeTransfer(f.ctx, types.BridgeTransfer{
		Id: 1, Sender: sender, Recipient: "r", Amount: &sdk.Coin{Denom: "uatom", Amount: math.NewInt(500)}, Status: "pending",
	}))
	assert.NoError(t, f.k.TransferMeta.Set(f.ctx, 1, types.TransferMeta{InitHeight: 1, TimeoutBlocks: 10}))
	f.bank.balances[authtypes.NewModuleAddress(types.ModuleName).String()] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(5000)))

	ctx := f.ctx.WithBlockHeight(100)
	assert.NoError(t, f.k.EndBlocker(ctx))

	got, _ := f.k.GetBridgeTransfer(f.ctx, 1)
	assert.Equal(t, "timed_out", got.Status)
}

func TestMsgServerInitiateBridgeTransfer(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	sender := sdk.AccAddress([]byte("test_address_______"))
	f.bank.balances[sender.String()] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))

	resp, err := srv.InitiateBridgeTransfer(f.ctx, &types.MsgInitiateBridgeTransfer{
		Sender: sender.String(), Recipient: "recipient",
		Amount: sdk.NewCoin("uatom", math.NewInt(500)), DestinationChain: "osmosis",
	})
	assert.NoError(t, err)
	assert.Greater(t, resp.TransferId, uint64(0))
}

func TestMsgServerCompleteBridgeTransfer(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	resp, err := srv.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{TransferId: 999, Validator: "validator", Proof: "proof"})
	assert.Error(t, err)
	assert.Nil(t, resp)
}

func TestMsgServerUpdateParams(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	authority := authtypes.NewModuleAddress(types.ModuleName).String()

	resp, err := srv.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: authority,
		Params: types.Params{SupportedChains: []string{"osmosis", "juno"}, MinTransferAmount: 500, MaxTransferAmount: 500000, TransferTimeoutBlocks: 500},
	})
	assert.NoError(t, err)
	assert.NotNil(t, resp)

	got, _ := f.k.GetParams(f.ctx)
	assert.Equal(t, []string{"osmosis", "juno"}, got.SupportedChains)
	assert.Equal(t, uint64(500), got.MinTransferAmount)
}

func TestMsgServerUpdateParamsUnauthorized(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	resp, err := srv.UpdateParams(f.ctx, &types.MsgUpdateParams{Authority: "unauthorized", Params: types.Params{}})
	assert.Error(t, err)
	assert.Nil(t, resp)
}

func TestQueryServerBridgeTransfer(t *testing.T) {
	f := initFixture(t)
	q := keeper.NewQueryServerImpl(f.k)

	_, err := q.BridgeTransfer(f.ctx, &types.QueryBridgeTransferRequest{TransferId: 999})
	assert.Error(t, err)

	assert.NoError(t, f.k.SetBridgeTransfer(f.ctx, types.BridgeTransfer{
		Id: 1, Sender: "s", Recipient: "r", Amount: &sdk.Coin{Denom: "uatom", Amount: math.NewInt(500)}, Status: "pending",
	}))
	resp, err := q.BridgeTransfer(f.ctx, &types.QueryBridgeTransferRequest{TransferId: 1})
	assert.NoError(t, err)
	assert.Equal(t, uint64(1), resp.Transfer.Id)
}

func TestQueryServerBridgeState(t *testing.T) {
	f := initFixture(t)
	q := keeper.NewQueryServerImpl(f.k)
	resp, err := q.BridgeState(f.ctx, &types.QueryBridgeStateRequest{})
	assert.NoError(t, err)
	assert.Equal(t, uint64(1), resp.State.NextTransferId)
}

func TestQueryServerParams(t *testing.T) {
	f := initFixture(t)
	q := keeper.NewQueryServerImpl(f.k)
	resp, err := q.Params(f.ctx, &types.QueryParamsRequest{})
	assert.NoError(t, err)
	assert.Equal(t, []string{"osmosis"}, resp.Params.SupportedChains)
}

func TestGetAllBridgeTransfers(t *testing.T) {
	f := initFixture(t)
	transfers, _, err := f.k.GetAllBridgeTransfers(f.ctx, nil)
	assert.NoError(t, err)
	assert.Empty(t, transfers)

	for i := uint64(1); i <= 5; i++ {
		assert.NoError(t, f.k.SetBridgeTransfer(f.ctx, types.BridgeTransfer{
			Id: i, Sender: "s", Recipient: "r", Amount: &sdk.Coin{Denom: "uatom", Amount: math.NewInt(100 * int64(i))}, Status: "pending",
		}))
	}
	transfers, _, err = f.k.GetAllBridgeTransfers(f.ctx, nil)
	assert.NoError(t, err)
	assert.Len(t, transfers, 5)
}
