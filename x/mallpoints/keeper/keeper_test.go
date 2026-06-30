package keeper_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mallpoints/keeper"
	module "marketplace/x/mallpoints/module"
	"marketplace/x/mallpoints/types"
)

type fixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
}

type mockBadgeKeeper struct{ has bool }

func (m mockBadgeKeeper) HasUserBadge(ctx context.Context, address string) bool { return m.has }

type mockMlcoinKeeper struct{}

func (m mockMlcoinKeeper) MintToWallet(ctx context.Context, address string, amount uint64) error {
	return nil
}
func (m mockMlcoinKeeper) WithMintingEnabled(ctx context.Context, fn func() error) error { return fn() }

func initFixture(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)

	badgeKeeper := mockBadgeKeeper{has: true}
	mlcoinKeeper := mockMlcoinKeeper{}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		badgeKeeper,
		mlcoinKeeper,
	)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addressCodec,
	}
}

func makeTestAddr(codec address.Codec, name string) string {
	str, err := codec.BytesToString([]byte(name))
	if err != nil {
		panic(fmt.Sprintf("failed to create address: %v", err))
	}
	return str
}

func TestMintToUserSuccess(t *testing.T) {
	f := initFixture(t)
	recipient := "test-address"
	err := f.keeper.MintToUser(f.ctx, recipient, 1000)
	require.NoError(t, err)
}

func TestConvertToMallcoinIntegration(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.keeper)
	user := makeTestAddr(f.addressCodec, "testuser")
	_ = f.keeper.UserPoints.Set(f.ctx, user, types.UserPoints{
		Address:        user,
		Points:         5000,
		TasksCompleted: 10,
	})
	sdkCtx := f.ctx.(sdk.Context).WithBlockTime(time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)
	_, err := srv.ConvertToMallcoin(wrappedCtx, &types.MsgConvertToMallcoin{
		Creator: user,
		Amount:  1000,
	})
	require.NoError(t, err)
	userPoints, err := f.keeper.UserPoints.Get(wrappedCtx, user)
	require.NoError(t, err)
	require.Equal(t, uint64(4000), userPoints.Points)
}

func TestConvertToMallcoinWindowClosed(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.keeper)
	user := makeTestAddr(f.addressCodec, "windowuser")
	_ = f.keeper.UserPoints.Set(f.ctx, user, types.UserPoints{
		Address: user,
		Points:  5000,
	})
	sdkCtx := f.ctx.(sdk.Context).WithBlockTime(time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)
	_, err := srv.ConvertToMallcoin(wrappedCtx, &types.MsgConvertToMallcoin{
		Creator: user,
		Amount:  1000,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "conversion window is closed")
}

func TestConvertToMallcoinNonBadgeHolderDec27(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	sdkCtx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	authority := authtypes.NewModuleAddress(types.GovModuleName)
	badgeKeeper := mockBadgeKeeper{has: false}
	mlcoinKeeper := mockMlcoinKeeper{}
	k := keeper.NewKeeper(storeService, encCfg.Codec, addressCodec, authority, badgeKeeper, mlcoinKeeper)
	if err := k.Params.Set(sdkCtx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}
	srv := keeper.NewMsgServerImpl(k)
	user := makeTestAddr(addressCodec, "nobadgeuser")
	_ = k.UserPoints.Set(sdkCtx, user, types.UserPoints{Address: user, Points: 5000})
	sdkCtx = sdkCtx.WithBlockTime(time.Date(2026, 12, 27, 12, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)
	_, err := srv.ConvertToMallcoin(wrappedCtx, &types.MsgConvertToMallcoin{Creator: user, Amount: 1000})
	require.NoError(t, err)
}

func TestConvertToMallcoinNonBadgeHolderWrongDate(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	sdkCtx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	authority := authtypes.NewModuleAddress(types.GovModuleName)
	badgeKeeper := mockBadgeKeeper{has: false}
	mlcoinKeeper := mockMlcoinKeeper{}
	k := keeper.NewKeeper(storeService, encCfg.Codec, addressCodec, authority, badgeKeeper, mlcoinKeeper)
	if err := k.Params.Set(sdkCtx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}
	srv := keeper.NewMsgServerImpl(k)
	user := makeTestAddr(addressCodec, "wrongdateuser")
	_ = k.UserPoints.Set(sdkCtx, user, types.UserPoints{Address: user, Points: 5000})
	sdkCtx = sdkCtx.WithBlockTime(time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)
	_, err := srv.ConvertToMallcoin(wrappedCtx, &types.MsgConvertToMallcoin{Creator: user, Amount: 1000})
	require.Error(t, err)
	require.Contains(t, err.Error(), "conversion window is closed")
}

func TestConvertToMallcoinInsufficientPoints(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.keeper)
	user := makeTestAddr(f.addressCodec, "insuffuser")
	_ = f.keeper.UserPoints.Set(f.ctx, user, types.UserPoints{Address: user, Points: 100})
	sdkCtx := f.ctx.(sdk.Context).WithBlockTime(time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)
	_, err := srv.ConvertToMallcoin(wrappedCtx, &types.MsgConvertToMallcoin{Creator: user, Amount: 1000})
	require.Error(t, err)
	require.Contains(t, err.Error(), "insufficient Mallpoints balance")
}

func TestHasBadgeDelegation(t *testing.T) {
	f := initFixture(t)
	userWithBadge := makeTestAddr(f.addressCodec, "badgeuser")
	hasBadge := f.keeper.HasBadge(f.ctx, userWithBadge)
	require.True(t, hasBadge, "HasBadge should return true when badgeKeeper returns true")
}
