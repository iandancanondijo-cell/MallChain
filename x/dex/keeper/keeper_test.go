package keeper

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/std"
	"github.com/cosmos/gogoproto/proto"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/testutil"
	storetypes "cosmossdk.io/store/types"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	"marketplace/x/dex/types"
)

type mockBankKeeper struct {
	balances map[string]sdk.Coins
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
	modKey := "module_" + recipientModule
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	m.balances[modKey] = m.balances[modKey].Add(amt...)
	return nil
}

func (m mockBankKeeper) SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	modKey := "module_" + senderModule
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	if !m.balances[modKey].IsAllGTE(amt) {
		return fmt.Errorf("insufficient module funds")
	}
	m.balances[modKey] = m.balances[modKey].Sub(amt...)
	recKey := recipientAddr.String()
	if m.balances[recKey] == nil {
		m.balances[recKey] = sdk.NewCoins()
	}
	m.balances[recKey] = m.balances[recKey].Add(amt...)
	return nil
}

func (m mockBankKeeper) MintCoins(ctx context.Context, moduleName string, amt sdk.Coins) error {
	modKey := "module_" + moduleName
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	m.balances[modKey] = m.balances[modKey].Add(amt...)
	return nil
}

func (m mockBankKeeper) BurnCoins(ctx context.Context, moduleName string, amt sdk.Coins) error {
	modKey := "module_" + moduleName
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	if !m.balances[modKey].IsAllGTE(amt) {
		return fmt.Errorf("insufficient funds to burn")
	}
	m.balances[modKey] = m.balances[modKey].Sub(amt...)
	return nil
}

func (m mockBankKeeper) GetBalance(ctx context.Context, addr sdk.AccAddress, denom string) sdk.Coin {
	key := addr.String()
	if m.balances[key] == nil {
		return sdk.NewCoin(denom, math.ZeroInt())
	}
	for _, c := range m.balances[key] {
		if c.Denom == denom {
			return c
		}
	}
	return sdk.NewCoin(denom, math.ZeroInt())
}

func newTestKeeper(t *testing.T) (Keeper, mockBankKeeper, sdk.Context) {
	t.Helper()
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	bank := mockBankKeeper{balances: make(map[string]sdk.Coins)}
	ir := cdctypes.NewInterfaceRegistry()
	std.RegisterInterfaces(ir)
	ir.RegisterImplementations((*proto.Message)(nil), &types.Pool{})
	protoCdc := codec.NewProtoCodec(ir)
	k, err := NewKeeper(
		storeService,
		protoCdc,
		bank,
		"authority_address",
	)
	require.NoError(t, err)

	require.NoError(t, k.SetParams(ctx, types.DefaultParams()))
	return k, bank, ctx
}

func TestCreatePool(t *testing.T) {
	tests := []struct {
		name      string
		setup     func(sdk.Context, Keeper)
		creator   sdk.AccAddress
		tokenA    sdk.Coin
		tokenB    sdk.Coin
		fee       string
		expectErr bool
		errSubstr string
	}{
		{
			name: "successful pool creation",
			creator: sdk.AccAddress([]byte("creator_address______")),
			tokenA:  sdk.NewCoin("tokenA", math.NewInt(1000)),
			tokenB:  sdk.NewCoin("tokenB", math.NewInt(2000)),
			fee:     "0.003",
		},
		{
			name: "same denom rejected",
			creator: sdk.AccAddress([]byte("creator_address______")),
			tokenA:  sdk.NewCoin("tokenA", math.NewInt(1000)),
			tokenB:  sdk.NewCoin("tokenA", math.NewInt(1000)),
			fee:     "0.003",
			expectErr: true, errSubstr: "token denominations must be different",
		},
		{
			name: "insufficient liquidity",
			creator: sdk.AccAddress([]byte("creator_address______")),
			tokenA:  sdk.NewCoin("tokenA", math.NewInt(1)),
			tokenB:  sdk.NewCoin("tokenB", math.NewInt(1)),
			fee:     "0.003",
			expectErr: true, errSubstr: "initial liquidity too low",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			k, bank, ctx := newTestKeeper(t)
			if tc.setup != nil {
				tc.setup(ctx, k)
			}
			bank.balances[tc.creator.String()] = sdk.Coins{tc.tokenA, tc.tokenB}

			poolId, err := k.CreatePool(ctx, tc.creator, tc.tokenA, tc.tokenB, tc.fee)
			if tc.expectErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.errSubstr)
				assert.Equal(t, uint64(0), poolId)
			} else {
				assert.NoError(t, err)
				assert.Greater(t, poolId, uint64(0))
			}
		})
	}
}

func TestAddLiquidity(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	creator := sdk.AccAddress([]byte("creator_address______"))
	bank.balances[creator.String()] = sdk.NewCoins(sdk.NewCoin("tokenA", math.NewInt(1500)), sdk.NewCoin("tokenB", math.NewInt(3000)))

	poolId, err := k.CreatePool(ctx, creator, sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)), "0.003")
	require.NoError(t, err)

	err = k.AddLiquidity(ctx, creator, poolId, sdk.NewCoin("tokenA", math.NewInt(500)), sdk.NewCoin("tokenB", math.NewInt(1000)))
	assert.NoError(t, err)

	liquidity, err := k.GetPoolLiquidity(ctx, poolId, creator)
	assert.NoError(t, err)
	assert.Greater(t, liquidity.Amount.Uint64(), uint64(0))
}

func TestRemoveLiquidity(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	creator := sdk.AccAddress([]byte("creator_address______"))
	bank.balances[creator.String()] = sdk.NewCoins(sdk.NewCoin("tokenA", math.NewInt(1500)), sdk.NewCoin("tokenB", math.NewInt(3000)))

	poolId, err := k.CreatePool(ctx, creator, sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)), "0.003")
	require.NoError(t, err)

	err = k.AddLiquidity(ctx, creator, poolId, sdk.NewCoin("tokenA", math.NewInt(500)), sdk.NewCoin("tokenB", math.NewInt(1000)))
	require.NoError(t, err)

	liquidity, _ := k.GetPoolLiquidity(ctx, poolId, creator)
	tokenAOut, tokenBOut, err := k.RemoveLiquidity(ctx, creator, poolId, liquidity)
	assert.NoError(t, err)
	assert.Greater(t, tokenAOut.Amount.Uint64(), uint64(0))
	assert.Greater(t, tokenBOut.Amount.Uint64(), uint64(0))
}

func TestSwap(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	creator := sdk.AccAddress([]byte("creator_address______"))
	trader := sdk.AccAddress([]byte("trader_address________"))
	bank.balances[creator.String()] = sdk.NewCoins(sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)))
	bank.balances[trader.String()] = sdk.NewCoins(sdk.NewCoin("tokenA", math.NewInt(100)))

	poolId, err := k.CreatePool(ctx, creator, sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)), "0.003")
	require.NoError(t, err)

	tokenOut, err := k.Swap(ctx, trader, poolId, sdk.NewCoin("tokenA", math.NewInt(100)), "tokenB", sdk.NewCoin("tokenB", math.NewInt(1)))
	assert.NoError(t, err)
	assert.Greater(t, tokenOut.Amount.Uint64(), uint64(0))
	assert.Equal(t, "tokenB", tokenOut.Denom)
}

func TestEstimateSwap(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	creator := sdk.AccAddress([]byte("creator_address______"))
	bank.balances[creator.String()] = sdk.NewCoins(sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)))

	poolId, err := k.CreatePool(ctx, creator, sdk.NewCoin("tokenA", math.NewInt(1000)), sdk.NewCoin("tokenB", math.NewInt(2000)), "0.003")
	require.NoError(t, err)

	tokenOut, fee, err := k.EstimateSwap(ctx, poolId, sdk.NewCoin("tokenA", math.NewInt(100)), "tokenB")
	assert.NoError(t, err)
	assert.Greater(t, tokenOut.Amount.Uint64(), uint64(0))
	assert.Equal(t, "tokenB", tokenOut.Denom)
	assert.Equal(t, "tokenA", fee.Denom)
}

func TestGetPool(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	_, err := k.GetPool(ctx, 999)
	assert.Error(t, err)

	pools, err := k.GetAllPools(ctx)
	assert.NoError(t, err)
	assert.Empty(t, pools)
}

func TestValidateFee(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	params, _ := k.GetParams(ctx)

	err := k.validateFee("0.003", params)
	assert.NoError(t, err)

	err = k.validateFee("0.0001", params)
	assert.Error(t, err)

	err = k.validateFee("0.1", params)
	assert.Error(t, err)
}
