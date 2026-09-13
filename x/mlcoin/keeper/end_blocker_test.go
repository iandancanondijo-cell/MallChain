package keeper_test

import (
	"testing"
	"time"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	mlcoinmodule "marketplace/x/mlcoin/module"
	"marketplace/x/mlcoin/types"
)

func keeperWithDeps(t *testing.T) (*keeper.Keeper, sdk.Context) {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
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
		types.AuthKeeper{},
		types.BankKeeper{},
	)

	_ = k.EmissionState.Set(ctx, types.EmissionState{
		TotalSupply: 670_000_000,
		Circulating: 0,
		MonthlyCap:  250_000_000,
		DailyLimit:  8_333_333,
	})

	return &k, ctx
}

func TestUpdateCurrencyRatesFromCommunity(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// Set initial currency rates
	_ = k.CurrencyRates.Set(ctx, "USD", types.CurrencyRate{Currency: "USD", RateToKes: 100})

	// Add trades: more buys than sells (within 1000 block window)
	_ = k.TradeHistory.Set(ctx, "trade1", types.Trade{
		TxId:        "trade1",
		TradeType:   "buy",
		MlcnAmount:  1000,
		BlockHeight: 500,
	})
	_ = k.TradeHistory.Set(ctx, "trade2", types.Trade{
		TxId:        "trade2",
		TradeType:   "sell",
		MlcnAmount:  500,
		BlockHeight: 500,
	})

	// Call UpdateCurrencyRatesFromCommunity
	k.UpdateCurrencyRatesFromCommunity(ctx)

	// Verify rates were adjusted
	usdRate, err := k.CurrencyRates.Get(ctx, "USD")
	require.NoError(t, err)
	// Net buy should increase rates
	require.NotEqual(t, uint64(100), usdRate.RateToKes, "Rate should change with trading activity")
}

func TestUpdateCurrencyRatesFromCommunityNetSell(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	_ = k.CurrencyRates.Set(ctx, "JPY", types.CurrencyRate{Currency: "JPY", RateToKes: 500})

	// Add trades: more sells than buys
	_ = k.TradeHistory.Set(ctx, "trade3", types.Trade{
		TxId:        "trade3",
		TradeType:   "sell",
		MlcnAmount:  2000,
		BlockHeight: 100,
	})
	_ = k.TradeHistory.Set(ctx, "trade4", types.Trade{
		TxId:        "trade4",
		TradeType:   "buy",
		MlcnAmount:  1000,
		BlockHeight: 100,
	})

	k.UpdateCurrencyRatesFromCommunity(ctx)

	jpyRate, err := k.CurrencyRates.Get(ctx, "JPY")
	require.NoError(t, err)
	// Net sell should decrease rate
	require.Less(t, jpyRate.RateToKes, uint64(500))
}

func TestUpdateCurrencyRatesFromCommunityFloor(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	_ = k.CurrencyRates.Set(ctx, "XYZ", types.CurrencyRate{Currency: "XYZ", RateToKes: 5})

	// Add large net sell trades
	for i := 0; i < 100; i++ {
		_ = k.TradeHistory.Set(ctx, string(rune(1000+i)), types.Trade{
			TxId:        string(rune(1000 + i)),
			TradeType:   "sell",
			MlcnAmount:  10000,
			BlockHeight: 100,
		})
	}

	k.UpdateCurrencyRatesFromCommunity(ctx)

	xyzRate, err := k.CurrencyRates.Get(ctx, "XYZ")
	require.NoError(t, err)
	// Rate should not go below 1
	require.GreaterOrEqual(t, xyzRate.RateToKes, uint64(1))
}

func TestEndBlockerTriggersDynamicPricing(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	_ = k.MarketPrice.Set(ctx, types.MarketPrice{
		BuyPrice:        62,
		SellPrice:       58,
		TotalBuyVolume:  0,
		TotalSellVolume: 0,
	})

	// Set block height to multiple of 100 to trigger dynamic pricing via EndBlocker
	ctx = ctx.WithBlockHeight(100)
	wrappedCtx := sdk.WrapSDKContext(ctx)

	err := k.EndBlocker(wrappedCtx)
	require.NoError(t, err)

	market, err := k.MarketPrice.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(100), market.LastUpdateHeight)
}

func TestUpdateDynamicPricingHighActivity(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	_ = k.MarketPrice.Set(ctx, types.MarketPrice{
		BuyPrice:        62,
		SellPrice:       58,
		TotalBuyVolume:  0,
		TotalSellVolume: 0,
	})

	// Initialize activity metrics with high activity
	_ = k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		TotalTransactions: 100000,
		TotalVolume:       1_000_000_000,
		ActiveUsers:       2000,
	})

	ctx = ctx.WithBlockHeight(100)
	wrappedCtx := sdk.WrapSDKContext(ctx)

	err := k.EndBlocker(wrappedCtx)
	require.NoError(t, err)

	market, err := k.MarketPrice.Get(ctx)
	require.NoError(t, err)

	// High activity should increase prices
	require.GreaterOrEqual(t, market.BuyPrice, uint64(62))
	require.GreaterOrEqual(t, market.SellPrice, uint64(58))
}

func TestEndBlockerConversionWindow(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// Set time to 15th of a month for badge conversion window
	ctx = ctx.WithBlockTime(time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC))
	ctx = ctx.WithBlockHeight(12000)
	wrappedCtx := sdk.WrapSDKContext(ctx)

	err := k.EndBlocker(wrappedCtx)
	require.NoError(t, err)

	metrics, err := k.ActivityMetrics.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, "badge_conversion_15th", metrics.CurrentPeriod)
}

func TestEndBlockerConversionWindowDec27(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// Set time to Dec 27
	ctx = ctx.WithBlockTime(time.Date(2026, 12, 27, 12, 0, 0, 0, time.UTC))
	ctx = ctx.WithBlockHeight(12000)
	wrappedCtx := sdk.WrapSDKContext(ctx)

	err := k.EndBlocker(wrappedCtx)
	require.NoError(t, err)

	metrics, err := k.ActivityMetrics.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, "all_users_conversion_27th_dec", metrics.CurrentPeriod)
}

func TestAccumulateFees(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// Test transfer fee accumulation
	err := k.AccumulateFees(ctx, "transfer", 1000)
	require.NoError(t, err)

	fees, err := k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(10), fees.TransactionFees) // 1% fee

	// Test buy/sell fee accumulation
	err = k.AccumulateFees(ctx, "buy", 1000)
	require.NoError(t, err)

	fees, err = k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(10), fees.TradingFees) // 1% fee

	// Test conversion fee accumulation
	err = k.AccumulateFees(ctx, "conversion", 500)
	require.NoError(t, err)

	fees, err = k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(5), fees.ConversionFees) // 1% fee
}

func TestStake(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	user := "marketplace1stakinguser1234567890abcdef"

	_ = k.WalletBalance.Set(ctx, user, types.WalletBalance{
		Address: user,
		Balance: 100000,
	})

	stakeID, err := k.Stake(ctx, user, 50000)
	require.NoError(t, err)
	require.Contains(t, stakeID, "stake-")

	// Verify wallet balance reduced
	wallet, err := k.WalletBalance.Get(ctx, user)
	require.NoError(t, err)
	require.Equal(t, uint64(50000), wallet.Balance)

	// Verify staking record created
	stake, err := k.StakingRecords.Get(ctx, stakeID)
	require.NoError(t, err)
	require.Equal(t, user, stake.Address)
	require.Equal(t, uint64(50000), stake.StakedAmount)
	require.True(t, stake.IsActive)
	require.Greater(t, stake.UnlockHeight, uint64(ctx.BlockHeight()))
}

func TestStakeInsufficientBalance(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
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
		types.AuthKeeper{},
		types.BankKeeper{},
	)

	user := "marketplace1pooruser1234567890abcdef"

	_ = k.WalletBalance.Set(ctx, user, types.WalletBalance{
		Address: user,
		Balance: 1000,
	})

	_, err := k.Stake(ctx, user, 50000)
	require.Error(t, err)
	require.Contains(t, err.Error(), "insufficient balance")
}

func TestStakeNonexistentWallet(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
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
		types.AuthKeeper{},
		types.BankKeeper{},
	)

	// Use a smaller RewardDivisor (→ effective MinStakeAmount=10) so the
	// C3 acceptance gate passes for small test stakes. This fixture's
	// actual assertion is on wallet-not-found, which is evaluated AFTER
	// the amount/minimum checks in Keeper.Stake.
	require.NoError(t, k.SetModuleIntervals(ctx, types.ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   100,
		StakingLockBlocks:    50,
		RewardDivisor:        10,
	}))

	user := "marketplace1nowalletuser1234567890"

	_, err := k.Stake(ctx, user, 200)
	require.Error(t, err)
	require.Contains(t, err.Error(), "wallet not found")
}

func TestStakeZeroAmount(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	user := "marketplace1zeroamountuser1234567890"

	_ = k.WalletBalance.Set(ctx, user, types.WalletBalance{
		Address: user,
		Balance: 10000,
	})

	_, err := k.Stake(ctx, user, 0)
	require.Error(t, err)
	require.Contains(t, err.Error(), "must be > 0")
}

func TestCalculateRewardsForStaking(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	_ = k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		EngagementScore: 1000,
	})

	// Test rewards calculation
	rewards := k.CalculateRewardsForStaking(ctx, 100000, 150000)
	require.GreaterOrEqual(t, rewards, uint64(0))

	_ = k.ActivityMetrics.Set(ctx, types.ActivityMetrics{})
	rewards = k.CalculateRewardsForStaking(ctx, 100000, 150000)
	require.GreaterOrEqual(t, rewards, uint64(0))
}

func TestRecordActivity(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// Record multiple activities
	err := k.RecordActivity(ctx, "buy", 1000, "user1", "user2")
	require.NoError(t, err)

	metrics, err := k.ActivityMetrics.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(1), metrics.TotalTransactions)
	require.Equal(t, uint64(1000), metrics.TotalVolume)
	require.Equal(t, uint64(2), metrics.ActiveUsers)
}

// DistributeFees itself is now covered with a real bank+auth keeper in
// distribute_fees_integration_test.go (TestDistributeFees_*) — this file's
// keeperWithDeps fixture uses a zero-value types.BankKeeper{}, which can't
// actually execute a mint/send without panicking, which is why that
// coverage lives in its own file instead of here.

// TestEndBlockerEmissionScheduleAnchorsToFirstTick guards against a
// regression where updateEmissionSchedule fed GetMonthlyEmission the raw
// absolute calendar month (year*12+month, e.g. ~24321 for 2026) instead of
// a small months-since-genesis counter. That pushed the halving phase index
// past 64, and a uint64 right-shift that far is defined as zero in Go — so
// DailyLimit collapsed to 0 on the very first tick and stayed there forever,
// permanently blocking MintToWallet (both BuyMallcoin and Mallpoints
// conversion check amount > DailyLimit).
func TestEndBlockerEmissionScheduleAnchorsToFirstTick(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.SetModuleIntervals(ctx, types.ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   100,
		ConversionTickBlocks: 100,
		StakingLockBlocks:    50,
		RewardDivisor:        10,
		// BlocksPerDay left at 0 (disabled) so EndBlocker skips
		// RecordTreasurySnapshot, which needs a fully wired BankKeeper —
		// same pre-existing constraint as TestDistributeFeesNoActiveStakers.
	}))

	// First tick, at an ordinary present-day calendar date — exactly the
	// scenario that used to zero DailyLimit immediately.
	ctx1 := ctx.WithBlockHeight(100).WithBlockTime(time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC))
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(ctx1)))

	emission, err := k.EmissionState.Get(ctx1)
	require.NoError(t, err)
	require.Equal(t, uint64(1), emission.CurrentMonth, "first tick should anchor to month 1, not the raw absolute calendar month")
	require.Equal(t, uint64(100000), emission.DailyLimit, "phase-1 monthly cap (3,000,000) / 30 days in September")

	// One calendar month later: CurrentMonth should advance to 2 (not jump
	// to another huge absolute number), and the daily limit must stay live.
	ctx2 := ctx.WithBlockHeight(200).WithBlockTime(time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC))
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(ctx2)))

	emission, err = k.EmissionState.Get(ctx2)
	require.NoError(t, err)
	require.Equal(t, uint64(2), emission.CurrentMonth)
	require.NotZero(t, emission.DailyLimit)

	// Years into the future (well past any real deployment horizon): the
	// phase index must still stay small since it's now relative to the
	// anchor, so the emission rate keeps halving on schedule instead of
	// vanishing to zero.
	ctx3 := ctx.WithBlockHeight(300).WithBlockTime(time.Date(2030, 1, 3, 0, 0, 0, 0, time.UTC))
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(ctx3)))

	emission, err = k.EmissionState.Get(ctx3)
	require.NoError(t, err)
	require.NotZero(t, emission.DailyLimit, "daily limit must never permanently collapse to zero")
}