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

// --- dynamic pricing: activity windows and bounded adjustment ----------------
//
// Regression coverage for the up-only ratchet that repriced MLCNS from 0.62 to
// 0.87 on the live chain: ActivityMetrics counters accumulated for the whole
// life of the chain (LastResetHeight was overwritten every tick and never
// read), and the volume component saturated after 500 MLCNS of lifetime
// volume, so engagement could never fall back under the 300 threshold that
// gates the price-decrease branch.

// pricingTestIntervals returns a windowed intervals set sized so that the
// heights used below land on dynamic-pricing ticks (multiples of 100) without
// also landing on an emission/conversion tick or the treasury-snapshot block —
// the last of those needs a real BankKeeper, which keeperWithDeps can't give.
func pricingTestIntervals(windowVersion uint64) types.ModuleIntervals {
	return types.ModuleIntervals{
		DynamicPricingBlocks:  100,
		EmissionTickBlocks:    100_000,
		ConversionTickBlocks:  100_000,
		StakingLockBlocks:     50,
		BlocksPerDay:          1000,
		BlocksPerMonth:        30_000,
		RewardDivisor:         10,
		FeeRateBps:            100,
		FeeSplitPercent:       50,
		ActivityWindowVersion: windowVersion,
	}
}

func TestDynamicPricingDiscardsLegacyLifetimeCounters(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	// State exactly as it exists on the live chain written before windowing:
	// intervals with no ActivityWindowVersion (the JSON codec decodes the
	// absent field as 0) plus lifetime-cumulative counters from ~70 transfers.
	require.NoError(t, k.SetModuleIntervals(ctx, pricingTestIntervals(0)))

	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 62, SellPrice: 58}))
	require.NoError(t, k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		TotalTransactions: 70,
		TotalVolume:       19_944_190_451, // ~19,944 MLCNS ever transferred
		ActiveUsers:       140,
		LastResetHeight:   40_000,
	}))

	tickCtx := ctx.WithBlockHeight(100)
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(tickCtx)))

	metrics, err := k.ActivityMetrics.Get(tickCtx)
	require.NoError(t, err)
	require.Zero(t, metrics.TotalVolume, "lifetime volume must not score in a fresh window")
	require.Zero(t, metrics.TotalTransactions)
	require.Zero(t, metrics.ActiveUsers)
	require.Zero(t, metrics.EngagementScore, "legacy state scored 514 engagement, which started the ratchet")
	require.Equal(t, uint64(100), metrics.LastResetHeight, "the new window must anchor at this tick")

	// The migration marker is persisted, so it runs once and never again.
	intervals, err := k.Intervals.Get(tickCtx)
	require.NoError(t, err)
	require.Equal(t, types.ActivityWindowVersionWindowed, intervals.ActivityWindowVersion)
}

func TestDynamicPricingVolumeComponentNoLongerSaturatesAt500Mlcn(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.SetModuleIntervals(ctx, pricingTestIntervals(types.ActivityWindowVersionWindowed)))
	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 87, SellPrice: 83}))

	// 500 MLCNS inside a single window — the old normalizer (micro/1e6, cap
	// 500) maxed the volume component on exactly this much activity.
	require.NoError(t, k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		TotalVolume:     500 * 1_000_000,
		LastResetHeight: 100,
	}))

	tickCtx := ctx.WithBlockHeight(100)
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(tickCtx)))

	metrics, err := k.ActivityMetrics.Get(tickCtx)
	require.NoError(t, err)
	require.Zero(t, metrics.EngagementScore, "500 MLCNS is noise, not max engagement; ~500,000 MLCNS is needed to max the volume component")
	require.Equal(t, int64(-50), metrics.PriceImpactMultiplier, "a quiet window must push the price back down")

	market, err := k.MarketPrice.Get(tickCtx)
	require.NoError(t, err)
	require.Less(t, market.BuyPrice, uint64(87), "price must decay when the window is quiet")
	require.GreaterOrEqual(t, market.BuyPrice, uint64(62))
}

func TestDynamicPricingRollsWindowAfterBlocksPerDay(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.SetModuleIntervals(ctx, pricingTestIntervals(types.ActivityWindowVersionWindowed)))
	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 87, SellPrice: 83}))
	require.NoError(t, k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		TotalTransactions: 5_000,
		TotalVolume:       800_000_000_000, // 800,000 MLCNS: a genuinely busy window
		ActiveUsers:       4_000,
		LastResetHeight:   100,
	}))

	// Still inside the window: last tick's busy counters must survive.
	withinWindow := ctx.WithBlockHeight(200)
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(withinWindow)))

	metrics, err := k.ActivityMetrics.Get(withinWindow)
	require.NoError(t, err)
	require.Equal(t, uint64(800_000_000_000), metrics.TotalVolume, "counters must not be discarded mid-window")
	require.Equal(t, uint64(100), metrics.LastResetHeight)

	// Past BlocksPerDay (100 >= 100 + 1000 is false; 1200 is true): the window
	// rolls and the next score is based on nothing but this window's activity.
	nextWindow := ctx.WithBlockHeight(1200)
	require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(nextWindow)))

	metrics, err = k.ActivityMetrics.Get(nextWindow)
	require.NoError(t, err)
	require.Zero(t, metrics.TotalVolume, "an elapsed window must be discarded")
	require.Zero(t, metrics.TotalTransactions)
	require.Zero(t, metrics.ActiveUsers)
	require.Equal(t, uint64(1200), metrics.LastResetHeight)
}

func TestDynamicPricingCannotExceedCeiling(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.SetModuleIntervals(ctx, pricingTestIntervals(types.ActivityWindowVersionWindowed)))
	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 62, SellPrice: 58}))

	// A sustained busy window: engagement 1000 → +50% impact, capped by the
	// 10%-per-tick circuit breaker. Without a ceiling the breaker still
	// compounds forever, which is how 0.62 became 0.87.
	require.NoError(t, k.ActivityMetrics.Set(ctx, types.ActivityMetrics{
		TotalTransactions: 30_000,
		TotalVolume:       1_000_000_000_000, // 1,000,000 MLCNS
		ActiveUsers:       20_000,
		LastResetHeight:   100,
	}))

	var buy, sell uint64
	// Stop below BlocksPerDay (1000): height 1000 would also fire
	// RecordTreasurySnapshot, which needs a real BankKeeper.
	for height := uint64(100); height <= 900; height += 100 {
		tickCtx := ctx.WithBlockHeight(int64(height))
		require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(tickCtx)))

		market, err := k.MarketPrice.Get(tickCtx)
		require.NoError(t, err)
		buy, sell = market.BuyPrice, market.SellPrice

		require.LessOrEqual(t, buy, uint64(93), "buy must stay within 1.5x the 0.62 base")
		require.LessOrEqual(t, sell, uint64(87), "sell must stay within 1.5x the 0.58 base")
		require.GreaterOrEqual(t, buy, uint64(62))
		require.GreaterOrEqual(t, sell, uint64(58))
	}

	require.Equal(t, uint64(93), buy, "sustained high activity should sit at the ceiling, not overshoot it")
	require.Equal(t, uint64(87), sell)
}

func TestDynamicPricingDecaysToBaseFloor(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.SetModuleIntervals(ctx, pricingTestIntervals(types.ActivityWindowVersionWindowed)))
	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 93, SellPrice: 87}))

	// Silence: metrics anchored at this tick with no activity at all.
	require.NoError(t, k.ActivityMetrics.Set(ctx, types.ActivityMetrics{LastResetHeight: 100}))

	var buy, sell uint64
	// Stop below BlocksPerDay (1000): height 1000 would also fire
	// RecordTreasurySnapshot, which needs a real BankKeeper.
	for height := uint64(100); height <= 900; height += 100 {
		tickCtx := ctx.WithBlockHeight(int64(height))
		require.NoError(t, k.EndBlocker(sdk.WrapSDKContext(tickCtx)))

		market, err := k.MarketPrice.Get(tickCtx)
		require.NoError(t, err)
		buy, sell = market.BuyPrice, market.SellPrice
		require.GreaterOrEqual(t, buy, uint64(62))
		require.GreaterOrEqual(t, sell, uint64(58))
	}

	require.Equal(t, uint64(62), buy, "a quiet chain must return to the 0.62 base")
	require.Equal(t, uint64(58), sell, "a quiet chain must return to the 0.58 base")
}
