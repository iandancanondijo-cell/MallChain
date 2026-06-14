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
