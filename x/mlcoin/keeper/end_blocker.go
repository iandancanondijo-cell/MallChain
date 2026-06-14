package keeper

import (
	"context"
	"time"

	"marketplace/x/mlcoin/types"

	"cosmossdk.io/math"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
)

// EndBlocker handles end-of-block operations for dynamic pricing and metrics
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Update activity-based pricing every N blocks (e.g., every 100 blocks)
	if sdkCtx.BlockHeight()%100 == 0 {
		if err := k.updateDynamicPricing(ctx); err != nil {
			// Log error but don't fail
			sdkCtx.Logger().Error("Failed to update dynamic pricing", "error", err)
		}
	}

	// Check and update conversion windows daily (every ~12000 blocks = 1 day)
	if sdkCtx.BlockHeight()%12000 == 0 {
		if err := k.updateConversionWindows(ctx); err != nil {
			// Log error but don't fail
			sdkCtx.Logger().Error("Failed to update conversion windows", "error", err)
		}
	}

	return nil
}

// RecordTreasurySnapshot captures the state of the treasury and supply at the end of each block

// updateDynamicPricing adjusts market prices based on community activity
func (k Keeper) updateDynamicPricing(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get or create activity metrics
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{
			TotalTransactions:     0,
			TotalVolume:           0,
			ActiveUsers:           0,
			EngagementScore:       0,
			PriceImpactMultiplier: 0,
			LastResetHeight:       uint64(sdkCtx.BlockHeight()),
			CurrentPeriod:         "daily",
		}
	}

	// Calculate engagement score (0-1000 scale)
	// Higher activity = higher score
	volumeScore := metrics.TotalVolume / 1000000 // normalize to 0-1000
	if volumeScore > 500 {
		volumeScore = 500 // cap at 500
	}
	transactionScore := metrics.TotalTransactions / 100 // normalize
	if transactionScore > 300 {
		transactionScore = 300
	}
	userScore := metrics.ActiveUsers / 10 // normalize
	if userScore > 200 {
		userScore = 200
	}

	metrics.EngagementScore = volumeScore + transactionScore + userScore

	// Calculate price impact multiplier based on engagement
	// Higher activity increases price (-50 to +50 = -0.5x to +0.5x adjustment)
	if metrics.EngagementScore > 500 {
		// High activity: increase price by 0-50%
		metrics.PriceImpactMultiplier = int64((metrics.EngagementScore - 500) / 10)
	} else if metrics.EngagementScore < 300 {
		// Low activity: decrease price by 0-50%
		metrics.PriceImpactMultiplier = -int64((300 - metrics.EngagementScore) / 6)
	} else {
		metrics.PriceImpactMultiplier = 0
	}

	// Apply price impact to market
	market, err := k.MarketPrice.Get(ctx)
	if err != nil {
		market = types.MarketPrice{BuyPrice: 62, SellPrice: 58}
	}

	// Adjust prices based on activity multiplier
	if metrics.PriceImpactMultiplier > 0 {
		// Increase prices on high activity
		adjustment := uint64(metrics.PriceImpactMultiplier)
		market.BuyPrice += adjustment
		market.SellPrice += adjustment
	} else if metrics.PriceImpactMultiplier < 0 {
		// Decrease prices on low activity
		adjustment := uint64(-metrics.PriceImpactMultiplier)
		if market.BuyPrice > adjustment {
			market.BuyPrice -= adjustment
		}
		if market.SellPrice > adjustment {
			market.SellPrice -= adjustment
		}
	}

	market.LastUpdateHeight = uint64(sdkCtx.BlockHeight())
	_ = k.MarketPrice.Set(ctx, market)

	// Store updated metrics
	metrics.LastResetHeight = uint64(sdkCtx.BlockHeight())
	_ = k.ActivityMetrics.Set(ctx, metrics)

	return nil
}

// updateConversionWindows updates conversion window status based on date
func (k Keeper) updateConversionWindows(ctx context.Context) error {
	// Get mallpoints keeper to update conversion windows
	// This is called at end of block to check if conversion window should be open

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

	// Distribute fees: 50% to stakers, 50% to treasury
	stakersShareAmount := totalFees / 2
	treasuryShareAmount := totalFees - stakersShareAmount

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
		}
	}

	// Reset accumulated fees
	fees.TransactionFees = 0
	fees.TradingFees = 0
	fees.ConversionFees = 0
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
