package keeper

import (
	"context"
	"errors"
	"fmt"
	"time"

	"marketplace/x/mlcoin/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
)

// Base market prices in KES cents. The dynamic pricing engine treats these as
// the floor of its band — the "0.62 floor" rule — and doubles as the
// initial/reset price. The matching ceiling is 1.5x base (see priceCeiling),
// so the live price sits in [0.62, 0.93] buy / [0.58, 0.87] sell and can move
// back down toward the base when activity is quiet.
const (
	baseBuyPriceCents  uint64 = 62 // 0.62 KES buy
	baseSellPriceCents uint64 = 58 // 0.58 KES sell
)

// Engagement scoring constants.
const (
	// volumeCap / transactionCap / userCap bound each engagement component so
	// no single dimension can exceed its share of the 0-1000 score.
	volumeCap       uint64 = 500
	transactionCap  uint64 = 300
	activeUsersCap  uint64 = 200
	highActivityMin uint64 = 500
	lowActivityMax  uint64 = 300

	// mlcnPerVolumePoint is how much settled Mallcoin volume, in whole MLCNS,
	// is worth one engagement point. Combined with volumeCap it means a window
	// needs ~500,000 MLCNS of settled volume to max out the volume component.
	mlcnPerVolumePoint uint64 = 1_000

	// mlcnMicroUnitScale is the 1e6 fixed-point scale x/mlcoin amounts are
	// recorded in. RecordActivity is fed msg.Amount from
	// MsgTransferMallcoin, which the senders (backend and CLI) build as
	// floor(amount * 1e6), so engagement normalizers must divide by this
	// before applying any per-point divisor. (The pre-existing code divided
	// cumulative micro volume by 1e6 and then capped it at 500, which
	// saturated the volume component after a lifetime total of 500 MLCNS.)
	mlcnMicroUnitScale uint64 = 1_000_000

	// priceCeilingMultiplier/priceCeilingDivisor express the ceiling as 1.5x
	// the base price. ActivityMetrics.price_impact_multiplier is documented in
	// activity_metrics.proto as "-50 to +50 = -0.5x to +0.5x adjustment", so
	// the engagement envelope around the base is 0.5x-1.5x; the base floor
	// already prevents the lower half, leaving [base, base*1.5]. Without a
	// ceiling the 10%-per-tick circuit breaker still compounds: a busy window
	// walks the price upward forever.
	priceCeilingMultiplier uint64 = 3
	priceCeilingDivisor    uint64 = 2
)

// microToMlcn converts an x/mlcoin amount recorded in micro units to whole
// MLCNS, truncating.
func microToMlcn(micro uint64) uint64 {
	return micro / mlcnMicroUnitScale
}

// EndBlocker handles end-of-block operations for dynamic pricing and metrics
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	intervals, err := k.GetModuleIntervals(ctx)
	if err != nil {
		return err
	}

	if intervals.DynamicPricingBlocks > 0 && sdkCtx.BlockHeight()%int64(intervals.DynamicPricingBlocks) == 0 {
		if err := k.updateDynamicPricing(ctx); err != nil {
			sdkCtx.Logger().Error("Failed to update dynamic pricing", "error", err)
		} else {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				types.EventTypeDynamicPrice,
				sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
				sdk.NewAttribute("height", fmt.Sprintf("%d", sdkCtx.BlockHeight())),
			))
		}
	}

	tick := intervals.EmissionTickBlocks
	if tick == 0 {
		tick = intervals.ConversionTickBlocks
	}
	if tick > 0 && sdkCtx.BlockHeight()%int64(tick) == 0 {
		if err := k.updateEmissionSchedule(ctx); err != nil {
			sdkCtx.Logger().Error("Failed to update emission schedule", "error", err)
		} else {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				types.EventTypeEmission,
				sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
				sdk.NewAttribute("height", fmt.Sprintf("%d", sdkCtx.BlockHeight())),
			))
		}
	}

	if intervals.ConversionTickBlocks > 0 && sdkCtx.BlockHeight()%int64(intervals.ConversionTickBlocks) == 0 {
		if err := k.updateConversionWindows(ctx); err != nil {
			sdkCtx.Logger().Error("Failed to update conversion windows", "error", err)
		} else {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				types.EventTypeConversion,
				sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
				sdk.NewAttribute("height", fmt.Sprintf("%d", sdkCtx.BlockHeight())),
			))
		}
	}

	if tick > 0 && sdkCtx.BlockHeight()%int64(tick) == 0 {
		if err := k.DistributeFees(ctx); err != nil {
			sdkCtx.Logger().Error("Failed to distribute accumulated fees", "error", err)
		}
	}

	if intervals.BlocksPerDay > 0 && sdkCtx.BlockHeight()%int64(intervals.BlocksPerDay) == 0 {
		if err := k.RecordTreasurySnapshot(ctx); err != nil {
			sdkCtx.Logger().Error("Failed to record treasury snapshot", "error", err)
		}
	}

	return nil
}

// maxTreasurySnapshotsToKeep bounds TreasurySnapshots so daily snapshots
// don't grow the store unboundedly over the chain's lifetime (~1.6 years
// of daily history at this cap).
const maxTreasurySnapshotsToKeep = 600

// RecordTreasurySnapshot captures the treasury/supply state (see
// TreasuryMetrics in query_treasury.go for the same figures on demand) as a
// point-in-time entry so TreasuryHistory has real data instead of always
// returning empty.
func (k Keeper) RecordTreasurySnapshot(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	snapshot := types.TreasurySnapshot{
		BlockHeight:       sdkCtx.BlockHeight(),
		TotalSupply:       k.GetTotalSupply(ctx),
		CirculatingSupply: k.GetCirculatingSupply(ctx),
		BurnedSupply:      k.GetBurnedSupply(ctx),
		StakedSupply:      k.GetTotalStaked(ctx),
		TreasuryBalance:   k.GetTreasuryBalance(ctx),
		Timestamp:         sdkCtx.BlockTime().Unix(),
	}
	return k.StoreTreasurySnapshot(ctx, snapshot)
}

// StoreTreasurySnapshot persists a snapshot and prunes oldest entries beyond
// maxTreasurySnapshotsToKeep. Split out from RecordTreasurySnapshot so the
// storage/pruning logic can be tested without needing a real bank keeper
// (GetTreasuryBalance queries one, which the lightweight unit-test fixture
// can't provide — mlcoin's BankKeeper is a type alias to the SDK's concrete
// BaseKeeper, not an interface, so it can't be mocked like other modules do).
func (k Keeper) StoreTreasurySnapshot(ctx context.Context, snapshot types.TreasurySnapshot) error {
	if err := k.TreasurySnapshots.Set(ctx, snapshot.BlockHeight, snapshot); err != nil {
		return err
	}

	// Prune oldest entries beyond the cap. Int64Key preserves numeric
	// ordering, so a forward Walk visits snapshots oldest-first.
	var count uint64
	var oldest []int64
	_ = k.TreasurySnapshots.Walk(ctx, nil, func(h int64, _ types.TreasurySnapshot) (bool, error) {
		count++
		oldest = append(oldest, h)
		return false, nil
	})
	if count > maxTreasurySnapshotsToKeep {
		toPrune := oldest[:count-maxTreasurySnapshotsToKeep]
		for _, h := range toPrune {
			if err := k.TreasurySnapshots.Remove(ctx, h); err != nil {
				return err
			}
		}
	}

	return nil
}

// updateDynamicPricing adjusts market prices based on community activity
// recorded inside the current activity window (see rollActivityWindow), so a
// usage spike can never permanently reprice the token: a quiet window scores
// zero and the price walks back down to the base floor.
func (k Keeper) updateDynamicPricing(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	height := uint64(sdkCtx.BlockHeight())

	intervals, err := k.GetModuleIntervals(ctx)
	if err != nil {
		return err
	}

	// Get or create activity metrics
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{
			LastResetHeight: height,
			CurrentPeriod:   "daily",
		}
	}

	metrics, intervals, err = k.rollActivityWindow(ctx, metrics, intervals, height)
	if err != nil {
		return err
	}

	// Calculate engagement score (0-1000 scale) from the window's activity.
	//
	// TotalVolume arrives in the units each caller records it in: the
	// transfer/stake paths pass msg.Amount straight from the micro-scaled
	// WalletBalance ledger (1e6 per MLCNS — see
	// msg_server_transfer_mallcoin_test.go's 100_000_000 delta for a 100 MLCNS
	// transfer), while the buy/sell paths pass whole MLCNS. Transfers carry
	// essentially all recorded volume in practice, so the score normalizes on
	// the micro scale; buy/sell volume therefore contributes very little here.
	// Known wart, left alone deliberately: fixing it means changing what
	// RecordActivity stores, which the existing transfer test pins.
	//
	// The pre-existing code divided cumulative micro volume by 1e6 (i.e. whole
	// MLCNS) and capped at 500, so the volume component maxed out after a
	// lifetime total of 500 MLCNS had ever move — saturation that, combined
	// with the counters never being reset, is what pushed the price into a
	// one-way ratchet.
	volumeScore := min(volumeCap, microToMlcn(metrics.TotalVolume)/mlcnPerVolumePoint)
	transactionScore := min(transactionCap, metrics.TotalTransactions/100)
	userScore := min(activeUsersCap, metrics.ActiveUsers/10)

	metrics.EngagementScore = volumeScore + transactionScore + userScore

	// Translate engagement into the documented -50..+50 (= -0.5x..+0.5x)
	// impact multiplier.
	if metrics.EngagementScore > highActivityMin {
		// High activity: increase price by 0-50%
		metrics.PriceImpactMultiplier = int64((metrics.EngagementScore - highActivityMin) / 10)
	} else if metrics.EngagementScore < lowActivityMax {
		// Low activity: decrease price by 0-50%
		metrics.PriceImpactMultiplier = -int64((lowActivityMax - metrics.EngagementScore) / 6)
	} else {
		metrics.PriceImpactMultiplier = 0
	}

	// Apply price impact to market
	market, err := k.MarketPrice.Get(ctx)
	if err != nil {
		market = types.MarketPrice{BuyPrice: baseBuyPriceCents, SellPrice: baseSellPriceCents}
	}

	// The multiplier is a percentage of the current price, not a raw number of
	// cents — the previous code added |multiplier| cents directly, so the
	// documented "-0.5x..+0.5x" envelope was really "+50 cents".
	// Circuit breaker: cap the change at 10% of the current price per tick to
	// prevent extreme swings from runaway feedback loops.
	impactPct := uint64(metrics.PriceImpactMultiplier)
	if metrics.PriceImpactMultiplier < 0 {
		impactPct = uint64(-metrics.PriceImpactMultiplier)
	}
	maxChangePct := uint64(10)
	if impactPct > maxChangePct {
		sdkCtx.Logger().Warn("dynamic pricing circuit breaker triggered",
			"height", height, "requested_pct", impactPct, "capped_pct", maxChangePct)
		impactPct = maxChangePct
	}

	if metrics.PriceImpactMultiplier > 0 {
		market.BuyPrice += market.BuyPrice * impactPct / 100
		market.SellPrice += market.SellPrice * impactPct / 100
	} else if metrics.PriceImpactMultiplier < 0 {
		buyDelta := min(market.BuyPrice, market.BuyPrice*impactPct/100)
		sellDelta := min(market.SellPrice, market.SellPrice*impactPct/100)
		market.BuyPrice -= buyDelta
		market.SellPrice -= sellDelta
	}

	// Bound the result to [base, base * 1.5]. The lower half of the documented
	// envelope is the "0.62 floor" rule; the upper half is the ceiling, without
	// which the per-tick circuit breaker still compounds and a long busy stretch
	// walks the price upward forever.
	market.BuyPrice = clampPrice(market.BuyPrice, baseBuyPriceCents, priceCeiling(baseBuyPriceCents))
	market.SellPrice = clampPrice(market.SellPrice, baseSellPriceCents, priceCeiling(baseSellPriceCents))

	market.LastUpdateHeight = height
	_ = k.MarketPrice.Set(ctx, market)

	// Store updated metrics. LastResetHeight is written by rollActivityWindow
	// only when a window actually starts — the previous code overwrote it on
	// every tick, which is why the elapsed-window check could never fire and
	// the counters accumulated for the whole life of the chain.
	_ = k.ActivityMetrics.Set(ctx, metrics)

	return nil
}

// rollActivityWindow returns the activity counters that should feed this tick's
// engagement score, starting a fresh window when the current one has run its
// course.
//
// Two cases reset the counters:
//
//  1. Legacy state — ModuleIntervals carries no ActivityWindowVersion (it was
//     written before windowing existed, and the JSON value codec decodes the
//     missing field as 0). Those counters are lifetime-cumulative and must not
//     be scored, so they are discarded once and the version marker is persisted.
//  2. The window anchored at LastResetHeight has elapsed BlocksPerDay blocks.
//
// Metrics that have never been anchored (LastResetHeight == 0) only get the
// anchor written, since their counters are already zero.
func (k Keeper) rollActivityWindow(
	ctx context.Context,
	metrics types.ActivityMetrics,
	intervals types.ModuleIntervals,
	height uint64,
) (types.ActivityMetrics, types.ModuleIntervals, error) {
	if intervals.ActivityWindowVersion != types.ActivityWindowVersionWindowed {
		metrics = zeroActivityWindow(metrics, height)
		intervals.ActivityWindowVersion = types.ActivityWindowVersionWindowed
		if err := k.Intervals.Set(ctx, intervals); err != nil {
			return metrics, intervals, err
		}
		return metrics, intervals, nil
	}

	if metrics.LastResetHeight == 0 {
		metrics.LastResetHeight = height
		return metrics, intervals, nil
	}

	if intervals.BlocksPerDay > 0 && height >= metrics.LastResetHeight+intervals.BlocksPerDay {
		metrics = zeroActivityWindow(metrics, height)
	}

	return metrics, intervals, nil
}

// zeroActivityWindow discards a window's activity counters and anchors the new
// window at height, keeping fields that describe the window rather than its
// contents (CurrentPeriod, written by updateConversionWindows).
func zeroActivityWindow(metrics types.ActivityMetrics, height uint64) types.ActivityMetrics {
	metrics.TotalTransactions = 0
	metrics.TotalVolume = 0
	metrics.ActiveUsers = 0
	metrics.EngagementScore = 0
	metrics.PriceImpactMultiplier = 0
	metrics.LastResetHeight = height
	return metrics
}

// priceCeiling returns the highest price (in cents) the engine may hold for a
// given base price.
func priceCeiling(base uint64) uint64 {
	return base * priceCeilingMultiplier / priceCeilingDivisor
}

// clampPrice keeps a price inside [floor, ceiling]. Callers subtract with a
// min(price, delta) guard, so an underflow can't be clamped back upward here;
// the ceiling check also pulls a price that has drifted above it (e.g. state
// written before the ceiling existed) back down on the next tick.
func clampPrice(price, floor, ceiling uint64) uint64 {
	if price < floor {
		return floor
	}
	if price > ceiling {
		return ceiling
	}
	return price
}

// updateConversionWindows updates conversion window status based on date
func (k Keeper) updateConversionWindows(ctx context.Context) error {
	// For users WITH badges: open on 15th of each month
	// For users WITHOUT badges: open on December 27th only

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentTime := sdkCtx.BlockTime()
	dayOfMonth := currentTime.Day()

	// Determine if window should be open for badge holders (15th of month)
	badgeWindowOpen := dayOfMonth == 15

	// Determine if window should be open for non-badge holders (Dec 27th)
	nonBadgeWindowOpen := (currentTime.Month() == time.December) && (dayOfMonth == 27)

	// Update both windows in storage (this would need a cross-module call or event)
	// For now, we just track the state in activity metrics as metadata
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{}
	}

	if badgeWindowOpen {
		metrics.CurrentPeriod = "badge_conversion_15th"
	} else if nonBadgeWindowOpen {
		metrics.CurrentPeriod = "all_users_conversion_27th_dec"
	} else {
		metrics.CurrentPeriod = "daily"
	}

	_ = k.ActivityMetrics.Set(ctx, metrics)

	return nil
}

// updateEmissionSchedule updates monthly emission and tracks halving schedule
func (k Keeper) updateEmissionSchedule(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentTime := sdkCtx.BlockTime()

	emission, err := k.EmissionState.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "emission state not initialized")
	}

	// Absolute calendar month (UTC), only used to measure elapsed months —
	// GetMonthlyEmission expects a small months-since-genesis counter, not
	// this raw value (feeding it directly shifts the phase index past 64
	// bits and zeroes the emission rate forever).
	absoluteMonth := uint64(currentTime.Year()*12 + int(currentTime.Month()))

	anchor, err := k.EmissionMonthAnchor.Get(ctx)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return err
		}
		// First tick ever: anchor to now, and treat this run as month 1 so
		// it lines up with the CurrentMonth=1 genesis already set.
		anchor = absoluteMonth
		if err := k.EmissionMonthAnchor.Set(ctx, anchor); err != nil {
			return err
		}
	}

	monthsSinceGenesis := absoluteMonth - anchor + 1

	// Calculate monthly emission for current phase
	monthlyEmission := types.GetMonthlyEmission(monthsSinceGenesis)
	dailyEmission := monthlyEmission / types.DaysInMonth(currentTime.Month(), currentTime.Year())

	// Check if we've entered a new month - update emission schedule
	if emission.CurrentMonth != monthsSinceGenesis {
		emission.CurrentMonth = monthsSinceGenesis
		emission.EmittedTotal = 0
	}

	// Update daily limit based on current schedule and activity
	emission.DailyLimit = dailyEmission

	return k.EmissionState.Set(ctx, emission)
}

// UpdateEmissionMonthly handles month rollover and halving
func (k Keeper) UpdateEmissionMonthly() uint64 {
	// This is called when a new month begins
	// Returns the new monthly emission rate
	return 0 // placeholder - actual logic in updateEmissionSchedule
}

// RecordActivity records a transaction in activity metrics
func (k Keeper) RecordActivity(ctx context.Context, txType string, volume uint64, users ...string) error {
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{}
	}

	metrics.TotalTransactions += 1
	metrics.TotalVolume += volume

	// Count unique active users (simple tracking)
	activeUserSet := make(map[string]bool)
	for _, user := range users {
		activeUserSet[user] = true
	}
	metrics.ActiveUsers += uint64(len(activeUserSet))

	// Cap metrics to prevent overflow
	if metrics.TotalTransactions > 1000000 {
		metrics.TotalTransactions = 0
		metrics.TotalVolume = 0
		metrics.ActiveUsers = 0
		metrics.EngagementScore = 0
	}

	return k.ActivityMetrics.Set(ctx, metrics)
}

// Treasury snapshot logic handled inside EndBlocker when enabled

// DistributeFees distributes accumulated fees to stakers and treasury
func (k Keeper) DistributeFees(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	fees, err := k.FeesAccumulated.Get(ctx)
	if err != nil {
		fees = types.FeesAccumulated{}
	}

	totalFees := fees.TransactionFees + fees.TradingFees + fees.ConversionFees

	if totalFees == 0 {
		return nil
	}

	// Fees are accrued against this module's custom WalletBalance ledger,
	// which is not x/bank: no code path ever moves real "mlcoin" coins INTO
	// this module account (SendCoinsFromAccountToModule appears only in the
	// dex, marketplace, governance and crosschain modules, never for
	// mlcoin). Minting totalFees here therefore created net-new supply every
	// distribution cycle, uncapped, and any user could trigger it because
	// MsgTransferMallcoin's fee floors to 1 base unit.
	//
	// Distribute only what the module actually holds in bank. The
	// undistributed remainder stays accrued so the ledger remains truthful
	// and a future migration to real coin collection can settle it.
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)
	available := k.bankKeeper.GetBalance(sdkCtx, moduleAddr, "mlcoin")

	distributable := totalFees
	if available.Amount.Uint64() < distributable {
		distributable = available.Amount.Uint64()
	}

	if distributable == 0 {
		// Nothing bank-backed to pay out. Record the cycle time so the
		// accumulator's staleness is visible, but mint nothing.
		fees.LastDistributionTime = sdkCtx.BlockTime().Unix()
		return k.FeesAccumulated.Set(ctx, fees)
	}

	// Distribute fees: 50% to stakers, 50% to treasury
	stakersShareAmount := distributable / 2
	treasuryShareAmount := distributable - stakersShareAmount

	// Collect all active stakers and their total stake
	var activeStakers []struct {
		key    string
		record types.StakingInfo
	}
	var totalStaked uint64 = 0

	// Iterate through all staking records to collect active stakers
	iter, err := k.StakingRecords.Iterate(ctx, nil)
	if err == nil {
		defer iter.Close()
		for ; iter.Valid(); iter.Next() {
			key, err := iter.Key()
			if err != nil {
				continue
			}
			record, err := iter.Value()
			if err != nil {
				continue
			}
			if record.IsActive {
				activeStakers = append(activeStakers, struct {
					key    string
					record types.StakingInfo
				}{key: key, record: record})
				totalStaked += record.StakedAmount
			}
		}
	}

	// paidOut tracks coins actually transferred this cycle. A failed send
	// must not clear its accrual, or the ledger silently destroys fees again
	// the way the pre-fix mint-and-reset path did.
	var paidOut uint64

	// Distribute to each active staker proportionally
	if stakersShareAmount > 0 && totalStaked > 0 {
		for _, staker := range activeStakers {
			// Calculate this staker's proportional share
			stakerShare := (stakersShareAmount * staker.record.StakedAmount) / totalStaked
			if stakerShare > 0 {
				// Send coins from mlcoin module to staker address
				coins := sdk.NewCoins(sdk.NewCoin("mlcoin", math.NewIntFromUint64(stakerShare)))
				stakerAddr, err := k.addressCodec.StringToBytes(staker.record.Address)
				if err != nil {
					continue // Skip on decode error
				}

				if err := k.bankKeeper.SendCoinsFromModuleToAccount(
					sdkCtx,
					types.ModuleName,
					stakerAddr,
					coins,
				); err != nil {
					// Log but continue with other stakers
					sdkCtx.Logger().Error("Failed to send staker rewards", "staker", staker.record.Address, "error", err)
					continue
				}

				// Update staker's rewards earned
				staker.record.RewardsEarned += stakerShare
				_ = k.StakingRecords.Set(ctx, staker.key, staker.record)
				paidOut += stakerShare
			}
		}
	}

	// Send treasury share to treasury module account
	if treasuryShareAmount > 0 {
		treasuryAddr := authtypes.NewModuleAddress("treasury")
		coins := sdk.NewCoins(sdk.NewCoin("mlcoin", math.NewIntFromUint64(treasuryShareAmount)))

		if err := k.bankKeeper.SendCoinsFromModuleToAccount(
			sdkCtx,
			types.ModuleName,
			treasuryAddr,
			coins,
		); err != nil {
			// Log error but don't fail the entire function
			sdkCtx.Logger().Error("Failed to send treasury share", "error", err)
		} else {
			paidOut += treasuryShareAmount
		}
	}

	// Clear only the amount actually paid out; anything undistributed stays
	// accrued for a later cycle.
	remaining := paidOut
	for _, acc := range []*uint64{&fees.TransactionFees, &fees.TradingFees, &fees.ConversionFees} {
		if remaining == 0 {
			break
		}
		take := *acc
		if take > remaining {
			take = remaining
		}
		*acc -= take
		remaining -= take
	}
	fees.LastDistributionTime = sdkCtx.BlockTime().Unix()

	return k.FeesAccumulated.Set(ctx, fees)
}

// AccumulateFees adds fees to the accumulated pool
func (k Keeper) AccumulateFees(ctx context.Context, txType string, amount uint64) error {
	fees, err := k.FeesAccumulated.Get(ctx)
	if err != nil {
		fees = types.FeesAccumulated{}
	}

	feeAmount := amount / 100 // 1% fee

	switch txType {
	case "transfer", "mint":
		fees.TransactionFees += feeAmount
	case "buy", "sell":
		fees.TradingFees += feeAmount
	case "conversion":
		fees.ConversionFees += feeAmount
	}

	return k.FeesAccumulated.Set(ctx, fees)
}
