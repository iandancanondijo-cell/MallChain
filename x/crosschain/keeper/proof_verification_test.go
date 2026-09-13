package keeper_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	"cosmossdk.io/log"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	clienttypes "github.com/cosmos/ibc-go/v10/modules/core/02-client/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	commitmenttypes "github.com/cosmos/ibc-go/v10/modules/core/23-commitment/types"
	commitmentv2 "github.com/cosmos/ibc-go/v10/modules/core/23-commitment/types/v2"
	host "github.com/cosmos/ibc-go/v10/modules/core/24-host"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"
	"github.com/stretchr/testify/require"

	"marketplace/x/crosschain/keeper"
	"marketplace/x/crosschain/types"
)

// Regression coverage for two real bugs found while auditing this module:
//
//  1. validateBondedValidator (transfer.go) re-parsed MsgCompleteBridgeTransfer's
//     `validator` field — which GetSigners (msg_signer.go) requires to be an
//     account-prefixed ("mall1...") address for the ante handler's signature
//     check to succeed — as a ValAddress/ConsAddress-prefixed string instead.
//     Those prefix requirements are mutually exclusive, so no legitimately
//     signed transaction could ever pass both, and CompleteBridgeTransfer
//     could never succeed for anyone.
//  2. verifyTransferProof (ibc.go) trusted the caller-supplied merkle path
//     AND value wholesale, verifying only that SOME value existed at SOME
//     attacker-chosen path — proving nothing about the SPECIFIC transfer
//     being completed. A proof for one (possibly tiny, legitimate) transfer
//     could complete a completely different one.

// fakeStakingKeeper lets each test configure exactly which validator
// (by account-address bytes, matching how validateBondedValidator now
// derives the lookup key) is bonded/jailed, unlike the package's shared
// mockStakingKeeper which always returns "not found".
type fakeStakingKeeper struct {
	byValAddr map[string]stakingtypes.Validator
}

func (f *fakeStakingKeeper) setBonded(accAddr sdk.AccAddress) {
	valAddr := sdk.ValAddress(accAddr)
	if f.byValAddr == nil {
		f.byValAddr = map[string]stakingtypes.Validator{}
	}
	f.byValAddr[valAddr.String()] = stakingtypes.Validator{
		OperatorAddress: valAddr.String(),
		Status:          stakingtypes.Bonded,
		Jailed:          false,
	}
}

func (f *fakeStakingKeeper) GetValidator(ctx context.Context, addr sdk.ValAddress) (stakingtypes.Validator, error) {
	if v, ok := f.byValAddr[addr.String()]; ok {
		return v, nil
	}
	return stakingtypes.Validator{}, stakingtypes.ErrNoValidatorFound
}

func (f *fakeStakingKeeper) GetValidatorByConsAddr(ctx context.Context, consAddr sdk.ConsAddress) (stakingtypes.Validator, error) {
	return stakingtypes.Validator{}, stakingtypes.ErrNoValidatorFound
}

// fakeLightClientModule implements exported.LightClientModule, succeeding
// VerifyMembership only when the path+value it's asked to check EXACTLY
// matches what the test configured — everything verifyTransferProof
// doesn't exercise panics, so an unexpected call fails loudly rather than
// silently returning a zero value.
type fakeLightClientModule struct {
	wantPath  string
	wantValue []byte
}

func (f *fakeLightClientModule) Initialize(ctx sdk.Context, clientID string, clientState, consensusState []byte) error {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) VerifyClientMessage(ctx sdk.Context, clientID string, clientMsg ibcexported.ClientMessage) error {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) CheckForMisbehaviour(ctx sdk.Context, clientID string, clientMsg ibcexported.ClientMessage) bool {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) UpdateStateOnMisbehaviour(ctx sdk.Context, clientID string, clientMsg ibcexported.ClientMessage) {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) UpdateState(ctx sdk.Context, clientID string, clientMsg ibcexported.ClientMessage) []ibcexported.Height {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) VerifyMembership(
	ctx sdk.Context, clientID string, height ibcexported.Height,
	delayTimePeriod, delayBlockPeriod uint64,
	proof []byte, path ibcexported.Path, value []byte,
) error {
	got, ok := path.(commitmentv2.MerklePath)
	if !ok {
		return fmt.Errorf("unexpected path type %T", path)
	}
	if got.String() != f.wantPath {
		return fmt.Errorf("path mismatch: got %q want %q", got.String(), f.wantPath)
	}
	if !bytes.Equal(value, f.wantValue) {
		return fmt.Errorf("value mismatch: got %x want %x", value, f.wantValue)
	}
	if len(proof) == 0 {
		return fmt.Errorf("empty proof")
	}
	return nil
}
func (f *fakeLightClientModule) VerifyNonMembership(
	ctx sdk.Context, clientID string, height ibcexported.Height,
	delayTimePeriod, delayBlockPeriod uint64, proof []byte, path ibcexported.Path,
) error {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) Status(ctx sdk.Context, clientID string) ibcexported.Status {
	return ibcexported.Active
}
func (f *fakeLightClientModule) LatestHeight(ctx sdk.Context, clientID string) ibcexported.Height {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) TimestampAtHeight(ctx sdk.Context, clientID string, height ibcexported.Height) (uint64, error) {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) RecoverClient(ctx sdk.Context, clientID, substituteClientID string) error {
	panic("not used by these tests")
}
func (f *fakeLightClientModule) VerifyUpgradeAndUpdateState(
	ctx sdk.Context, clientID string, newClient, newConsState, upgradeClientProof, upgradeConsensusStateProof []byte,
) error {
	panic("not used by these tests")
}

type fakeIBCClientKeeper struct {
	clientID string
	module   ibcexported.LightClientModule
}

func (f *fakeIBCClientKeeper) Route(ctx sdk.Context, clientID string) (ibcexported.LightClientModule, error) {
	if clientID != f.clientID {
		return nil, fmt.Errorf("no route for client %s", clientID)
	}
	return f.module, nil
}

// proofFixture mirrors initFixture but wires the configurable staking/IBC
// client fakes above instead of the package's always-fail shared mocks.
type proofFixture struct {
	ctx     sdk.Context
	k       keeper.Keeper
	codec   address.Codec
	bank    *mockBankKeeper
	staking *fakeStakingKeeper
	client  *fakeIBCClientKeeper
}

func initProofFixture(t *testing.T, clientModule *fakeLightClientModule, clientID string) *proofFixture {
	t.Helper()
	protoCdc := cdctypes.NewInterfaceRegistry()
	cdc := codec.NewProtoCodec(protoCdc)
	addressCdc := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	bank := &mockBankKeeper{balances: make(map[string]sdk.Coins)}
	staking := &fakeStakingKeeper{}
	client := &fakeIBCClientKeeper{clientID: clientID, module: clientModule}

	k, err := keeper.NewKeeper(
		cdc,
		storeService,
		log.NewNopLogger(),
		mockAccountKeeper{},
		bank,
		mockIBCTransferKeeper{},
		staking,
		client,
	)
	require.NoError(t, err)
	require.NoError(t, k.Params.Set(ctx, types.Params{
		AdminAddress:          authtypes.NewModuleAddress(types.ModuleName).String(),
		SupportedChains:       []string{"osmosis"},
		MinTransferAmount:     1,
		MaxTransferAmount:     1000000,
		TransferTimeoutBlocks: 1000,
	}))
	require.NoError(t, k.BridgeState.Set(ctx, types.BridgeState{NextTransferId: 1}))

	return &proofFixture{ctx: ctx, k: k, codec: addressCdc, bank: bank, staking: staking, client: client}
}

// expectedCommitment recomputes exactly what verifyTransferProof should
// derive for a given transfer + TransferMeta, so tests can configure the
// fake light client to accept precisely that (or something deliberately
// different, to prove mismatches get rejected).
func expectedCommitment(transfer types.BridgeTransfer, meta types.TransferMeta) (path string, value []byte) {
	packetData := ibctransfertypes.FungibleTokenPacketData{
		Denom:    transfer.AssetDenom,
		Amount:   transfer.Amount.Amount.String(),
		Sender:   authtypes.NewModuleAddress(types.ModuleName).String(),
		Receiver: transfer.Recipient,
		Memo:     types.FormatBridgeMemo(transfer.Id),
	}
	packet := channeltypes.NewPacket(
		packetData.GetBytes(), meta.IBCSequence, meta.PortID, meta.ChannelID,
		"", "", clienttypes.NewHeight(0, 0), meta.TimeoutTimestamp,
	)
	value = channeltypes.CommitPacket(packet)
	merklePath := commitmenttypes.NewMerklePath(
		[]byte(ibcexported.StoreKey),
		host.PacketCommitmentKey(meta.PortID, meta.ChannelID, meta.IBCSequence),
	)
	return merklePath.String(), value
}

func recipientAddr(seed string) string {
	return sdk.AccAddress([]byte(fmt.Sprintf("%-20s", seed)[:20])).String()
}

func rawProofJSON(t *testing.T, clientID string, height uint64) string {
	t.Helper()
	body := map[string]any{
		"client_id":       clientID,
		"revision_height": height,
		"proof":           base64.StdEncoding.EncodeToString([]byte("a-real-merkle-proof-would-go-here")),
	}
	b, err := json.Marshal(body)
	require.NoError(t, err)
	return string(b)
}

func TestCompleteBridgeTransfer_RejectsWhenNoRealPacketWasEverSent(t *testing.T) {
	f := initProofFixture(t, &fakeLightClientModule{}, "07-tendermint-0")

	sender := sdk.AccAddress([]byte("sender______________"))
	f.staking.setBonded(sender)
	amount := sdk.NewCoin("uatom", math.NewInt(500))
	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, types.BridgeTransfer{
		Id: 1, Sender: sender.String(), Recipient: recipientAddr("recipient"), Amount: &amount,
		AssetDenom: "uatom", Status: "pending",
	}))
	// Deliberately no TransferMeta set — matches every transfer on this
	// chain today, since SetChainRoute has no production caller yet.

	err := f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: 1, Validator: sender.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	})
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrInvalidProof)
}

func TestCompleteBridgeTransfer_RejectsProofBoundToADifferentTransfer(t *testing.T) {
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)

	amountA := sdk.NewCoin("uatom", math.NewInt(500))
	transferA := types.BridgeTransfer{Id: 1, Sender: "s", Recipient: recipientAddr("recipientA"), Amount: &amountA, AssetDenom: "uatom", Status: "pending"}
	metaA := types.TransferMeta{IBCSequence: 1, PortID: "transfer", ChannelID: "channel-0"}
	pathA, valueA := expectedCommitment(transferA, metaA)

	amountB := sdk.NewCoin("uatom", math.NewInt(999999))
	transferB := types.BridgeTransfer{Id: 2, Sender: "s", Recipient: recipientAddr("attacker"), Amount: &amountB, AssetDenom: "uatom", Status: "pending"}
	metaB := types.TransferMeta{IBCSequence: 2, PortID: "transfer", ChannelID: "channel-0"}

	// The fake light client only accepts transfer A's exact reconstructed
	// (path, value) — simulating a real, validly-obtained proof for A.
	f := initProofFixture(t, &fakeLightClientModule{wantPath: pathA, wantValue: valueA}, "07-tendermint-0")
	sender := sdk.AccAddress([]byte("sender______________"))
	f.staking.setBonded(sender)

	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, transferA))
	require.NoError(t, f.k.TransferMeta.Set(f.ctx, transferA.Id, metaA))
	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, transferB))
	require.NoError(t, f.k.TransferMeta.Set(f.ctx, transferB.Id, metaB))
	f.bank.balances[moduleAddr.String()] = sdk.NewCoins(sdk.NewCoin("uatom", amountA.Amount.Add(amountB.Amount)))

	// A's own proof legitimately completes A.
	require.NoError(t, f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: transferA.Id, Validator: sender.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	}))

	// The SAME proof bytes must NOT complete B — B's reconstructed
	// commitment differs (different sequence, amount, recipient), so the
	// fake client (which only accepts A's exact path+value) rejects it.
	err := f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: transferB.Id, Validator: sender.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	})
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrInvalidProof)

	unchanged, err := f.k.GetBridgeTransfer(f.ctx, transferB.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", unchanged.Status)
}

func TestCompleteBridgeTransfer_SucceedsWithAGenuineMatchingProof(t *testing.T) {
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)
	amount := sdk.NewCoin("uatom", math.NewInt(500))
	transfer := types.BridgeTransfer{Id: 1, Sender: "s", Recipient: recipientAddr("recipient"), Amount: &amount, AssetDenom: "uatom", Status: "pending"}
	meta := types.TransferMeta{IBCSequence: 1, PortID: "transfer", ChannelID: "channel-0"}
	path, value := expectedCommitment(transfer, meta)

	f := initProofFixture(t, &fakeLightClientModule{wantPath: path, wantValue: value}, "07-tendermint-0")
	sender := sdk.AccAddress([]byte("sender______________"))
	f.staking.setBonded(sender)

	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, transfer))
	require.NoError(t, f.k.TransferMeta.Set(f.ctx, transfer.Id, meta))
	f.bank.balances[moduleAddr.String()] = sdk.NewCoins(amount)

	require.NoError(t, f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: transfer.Id, Validator: sender.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	}))

	completed, err := f.k.GetBridgeTransfer(f.ctx, transfer.Id)
	require.NoError(t, err)
	require.Equal(t, "completed", completed.Status)
}

func TestCompleteBridgeTransfer_RejectsNonValidatorSigner(t *testing.T) {
	amount := sdk.NewCoin("uatom", math.NewInt(500))
	transfer := types.BridgeTransfer{Id: 1, Sender: "s", Recipient: recipientAddr("recipient"), Amount: &amount, AssetDenom: "uatom", Status: "pending"}
	meta := types.TransferMeta{IBCSequence: 1, PortID: "transfer", ChannelID: "channel-0"}
	path, value := expectedCommitment(transfer, meta)

	f := initProofFixture(t, &fakeLightClientModule{wantPath: path, wantValue: value}, "07-tendermint-0")
	// Deliberately NOT registered as bonded via f.staking.setBonded.
	notAValidator := sdk.AccAddress([]byte("random_account______"))

	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, transfer))
	require.NoError(t, f.k.TransferMeta.Set(f.ctx, transfer.Id, meta))

	err := f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: transfer.Id, Validator: notAValidator.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	})
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrUnauthorized)
}

func TestCompleteBridgeTransfer_RejectsJailedValidatorSigner(t *testing.T) {
	amount := sdk.NewCoin("uatom", math.NewInt(500))
	transfer := types.BridgeTransfer{Id: 1, Sender: "s", Recipient: recipientAddr("recipient"), Amount: &amount, AssetDenom: "uatom", Status: "pending"}
	meta := types.TransferMeta{IBCSequence: 1, PortID: "transfer", ChannelID: "channel-0"}
	path, value := expectedCommitment(transfer, meta)

	f := initProofFixture(t, &fakeLightClientModule{wantPath: path, wantValue: value}, "07-tendermint-0")
	jailed := sdk.AccAddress([]byte("jailed_validator____"))
	f.staking.setBonded(jailed)
	rec := f.staking.byValAddr[sdk.ValAddress(jailed).String()]
	rec.Jailed = true
	f.staking.byValAddr[sdk.ValAddress(jailed).String()] = rec

	require.NoError(t, f.k.SetBridgeTransfer(f.ctx, transfer))
	require.NoError(t, f.k.TransferMeta.Set(f.ctx, transfer.Id, meta))

	err := f.k.CompleteBridgeTransfer(f.ctx, &types.MsgCompleteBridgeTransfer{
		TransferId: transfer.Id, Validator: jailed.String(), Proof: rawProofJSON(t, "07-tendermint-0", 100),
	})
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrUnauthorized)
}
