package keeper_test

import (
	"context"
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

// mock keepers
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

	// Create mock badge and mlcoin keepers for testing
	var badgeKeeper types.BadgeKeeper = mockBadgeKeeper{has: true}
	var mlcoinKeeper types.MlcoinKeeper = mockMlcoinKeeper{}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		badgeKeeper,
		mlcoinKeeper,
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

func TestAwardPointsMonthlyCap(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.keeper)

	sdkCtx := f.ctx.(sdk.Context).WithBlockTime(time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC))
	wrappedCtx := sdk.WrapSDKContext(sdkCtx)

	authorityStr, err := f.addressCodec.BytesToString(f.keeper.GetAuthority())
	require.NoError(t, err)

	firstAward := types.MsgAwardPoints{
		Creator:   authorityStr,
		Recipient: authorityStr,
		Amount:    types.MonthlyPointsCap,
		TaskType:  "engagement",
	}

	_, err = srv.AwardPoints(wrappedCtx, &firstAward)
	require.NoError(t, err)

	monthlyKey := sdkCtx.BlockTime().UTC().Format("2006-01")
	monthlyIssued, err := f.keeper.MonthlyPointsIssued.Get(f.ctx, monthlyKey)
	require.NoError(t, err)
	require.Equal(t, types.MonthlyPointsCap, monthlyIssued)

	secondAward := types.MsgAwardPoints{
		Creator:   authorityStr,
		Recipient: authorityStr,
		Amount:    1,
		TaskType:  "engagement",
	}

	_, err = srv.AwardPoints(wrappedCtx, &secondAward)
	require.Error(t, err)
	require.Contains(t, err.Error(), "monthly Mallpoints issuance cap exceeded")
}
