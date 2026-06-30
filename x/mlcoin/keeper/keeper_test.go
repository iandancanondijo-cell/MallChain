package keeper_test

import (
	"context"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	module "marketplace/x/mlcoin/module"
	"marketplace/x/mlcoin/types"
)

type fixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
}

func initFixture(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		types.AuthKeeper{}, // authKeeper (zero value for unit tests)
		types.BankKeeper{}, // bankKeeper (zero value for unit tests)
	)

	// Initialize params
	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addressCodec,
	}
}

func TestBuyMallcoinLiquidityCap(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(&f.keeper)
	buyer := "buyer1"

	require.NoError(t, f.keeper.KesBalance.Set(f.ctx, buyer, types.KesBalance{Address: buyer, Balance: 200_000_000}))
	require.NoError(t, f.keeper.EmissionState.Set(f.ctx, types.EmissionState{TotalSupply: 670_000_000, Circulating: 0, DailyLimit: 1_000_000_000}))

	sdkCtx := f.ctx.(sdk.Context)
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)

	firstBuy := &types.MsgBuyMallcoin{Buyer: buyer, MlcnAmount: 919354}
	_, err := srv.BuyMallcoin(wrappedCtx, firstBuy)
	require.NoError(t, err)

	secondBuy := &types.MsgBuyMallcoin{Buyer: buyer, MlcnAmount: 1}
	_, err = srv.BuyMallcoin(wrappedCtx, secondBuy)
	require.Error(t, err)
	require.Contains(t, err.Error(), types.ErrLiquidityCapExceeded.Error())
}

func TestBuyMallcoinTotalSupplyCap(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(&f.keeper)
	buyer := "buyer2"

	require.NoError(t, f.keeper.KesBalance.Set(f.ctx, buyer, types.KesBalance{Address: buyer, Balance: 1_000_000_000}))
	require.NoError(t, f.keeper.EmissionState.Set(f.ctx, types.EmissionState{TotalSupply: 670_000_000, Circulating: 670_000_000, DailyLimit: 1_000_000_000}))

	sdkCtx := f.ctx.(sdk.Context)
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)

	_, err := srv.BuyMallcoin(wrappedCtx, &types.MsgBuyMallcoin{Buyer: buyer, MlcnAmount: 1})
	require.Error(t, err)
	require.Contains(t, err.Error(), types.ErrSupplyExhausted.Error())
}

func TestTransferWithVestingLocked(t *testing.T) {
	f := initFixture(t)
	sender := testAddr(0x10)
	recipient := testAddr(0x20)

	// Set up sender wallet with vested tokens (locked) - 160M MLCN in micro-units
	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, sender, types.WalletBalance{
		Address: sender,
		Balance: 0,
		Locked:  160_000_000_000_000,
	}))

	// Transfer should fail - no spendable balance
	err := f.keeper.Transfer(f.ctx, sender, recipient, 100_000_000)
	require.Error(t, err)
	require.Contains(t, err.Error(), types.ErrInsufficientBalance.Error())
}

func TestTransferSuccess(t *testing.T) {
	f := initFixture(t)
	sender := testAddr(0x11)
	recipient := testAddr(0x21)

	// Set up sender wallet with spendable balance - 500 MLCN
	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, sender, types.WalletBalance{
		Address: sender,
		Balance: 500_000_000_000,
	}))

	// Transfer should succeed
	err := f.keeper.Transfer(f.ctx, sender, recipient, 200_000_000_000)
	require.NoError(t, err)

	senderWallet, err := f.keeper.WalletBalance.Get(f.ctx, sender)
	require.NoError(t, err)
	require.Equal(t, uint64(300_000_000_000), senderWallet.Balance)

	recipientWallet, err := f.keeper.WalletBalance.Get(f.ctx, recipient)
	require.NoError(t, err)
	require.Equal(t, uint64(200_000_000_000), recipientWallet.Balance)
}

func TestVestingUnlockAfterTime(t *testing.T) {
	f := initFixture(t)
	founder := testAddr(0x12)

	// Genesis time is 2026-01-24, unlock time is 2031-01-24 (in the future)
	futureUnlockTime := int64(1926979200) // 2031-01-24
	pastUnlockTime := int64(1768880000)  // 2026-01-24 (past)

	// Test wallet with future unlock time (still locked)
	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, founder, types.WalletBalance{
		Address:    founder,
		Balance:    0,
		Locked:     100_000_000_000, // 100 MLCN in micro
		UnlockTime: futureUnlockTime,
	}))

	err := f.keeper.Transfer(f.ctx, founder, testAddr(0x22), 50_000_000_000)
	require.Error(t, err) // Should fail - still locked

	// Test wallet with past unlock time (should auto-release)
	pastWallet := testAddr(0x13)
	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, pastWallet, types.WalletBalance{
		Address:    pastWallet,
		Balance:    0,
		Locked:     200_000_000_000, // 200 MLCN in micro
		UnlockTime: pastUnlockTime,
	}))

	// Wallet should have been auto-released when we accessed it via Transfer
	err = f.keeper.Transfer(f.ctx, pastWallet, pastWallet, 0)
	require.NoError(t, err)

	w, err := f.keeper.WalletBalance.Get(f.ctx, pastWallet)
	require.NoError(t, err)
	require.Equal(t, uint64(200_000_000_000), w.Balance)
	require.Equal(t, uint64(0), w.Locked)
}
