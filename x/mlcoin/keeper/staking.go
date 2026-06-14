package keeper

import (
	"context"
	"fmt"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Stake allows users to stake Mallcoins for rewards
func (k Keeper) Stake(ctx context.Context, address string, amount uint64) (string, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if amount == 0 {
		return "", errorsmod.Wrap(types.ErrInvalidRequest, "stake amount must be > 0")
	}

	// Get user's wallet balance
	wallet, err := k.WalletBalance.Get(ctx, address)
	if err != nil {
		return "", errorsmod.Wrap(types.ErrWalletNotFound, "wallet not found")
	}

	if wallet.Balance < amount {
		return "", errorsmod.Wrap(types.ErrInsufficientBalance, "insufficient balance to stake")
	}

	// Deduct from wallet
	wallet.Balance -= amount
	if err := k.WalletBalance.Set(ctx, address, wallet); err != nil {
		return "", err
	}

	// Create staking record with 180-day (6-month) lock period (~1555200 blocks)
	seq, err := k.StakingSequence.Next(ctx)
	if err != nil {
		return "", err
	}
	stakeID := fmt.Sprintf("stake-%d-%s", seq, address)
	stakeInfo := types.StakingInfo{
		Address:       address,
		StakedAmount:  amount,
		StakeDate:     int64(sdkCtx.BlockHeight()), // stored as block height for duration calculations
		RewardsEarned: 0,
		IsActive:      true,
		UnlockHeight:  uint64(sdkCtx.BlockHeight()) + 1555200, // ~6 months
	}

	// Persist staking record
	if err := k.StakingRecords.Set(ctx, stakeID, stakeInfo); err != nil {
		return "", err
	}

	// Record transaction
	_, _ = k.RecordTransaction(ctx, address, "staking", amount, "stake", "Staked for rewards")

	// Record activity
	_ = k.RecordActivity(ctx, "stake", amount, address)

	return stakeID, nil
}

// UnstakeAndClaimRewards allows users to unstake after lock period and claim accrued rewards
func (k Keeper) UnstakeAndClaimRewards(ctx context.Context, address string, stakeID string) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Retrieve staking record
	stakeInfo, err := k.StakingRecords.Get(ctx, stakeID)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "stake not found")
	}

	if stakeInfo.Address != address {
		return 0, errorsmod.Wrap(types.ErrUnauthorized, "stake does not belong to caller")
	}

	if !stakeInfo.IsActive {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "stake already inactive")
	}

	if uint64(sdkCtx.BlockHeight()) < stakeInfo.UnlockHeight {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "stake is still locked")
	}

	// Calculate rewards based on:
	// - Staked amount
	// - Staking duration
	// - Network activity level
	// - Engagement score

	// Calculate rewards based on staking duration
	stakedBlocks := uint64(sdkCtx.BlockHeight()) - uint64(stakeInfo.StakeDate)
	rewards := k.CalculateRewardsForStaking(ctx, stakeInfo.StakedAmount, stakedBlocks)

	// Return staked amount + rewards to wallet
	wallet, err := k.WalletBalance.Get(ctx, address)
	if err != nil {
		wallet = types.WalletBalance{Address: address, Balance: 0, Locked: 0}
	}
	totalReturn := stakeInfo.StakedAmount + rewards
	wallet.Balance += totalReturn
	if err := k.WalletBalance.Set(ctx, address, wallet); err != nil {
		return 0, err
	}

	// Mark stake inactive and persist closure details
	stakeInfo.IsActive = false
	stakeInfo.RewardsEarned = rewards
	if err := k.StakingRecords.Set(ctx, stakeID, stakeInfo); err != nil {
		return 0, errorsmod.Wrap(err, "failed to update staking record")
	}

	// Record transaction
	_, _ = k.RecordTransaction(ctx, "staking", address, totalReturn, "reward", "Staking rewards claimed")

	return rewards, nil
}

// CalculateRewardsForStaking calculates staking rewards based on multiple factors
func (k Keeper) CalculateRewardsForStaking(ctx context.Context, stakedAmount, stakeDurationBlocks uint64) uint64 {
	// Get activity metrics for engagement multiplier
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{EngagementScore: 500} // default middle score
	}

	// Base reward: 2% annual return (simplified)
	blockRewards := stakedAmount / 18250 // 365 days * 50 blocks/day

	// Apply engagement multiplier (0.5x to 1.5x)
	engagementMultiplier := metrics.EngagementScore / 1000
	if engagementMultiplier == 0 {
		engagementMultiplier = 1
	}

	// Duration bonus: longer stakes earn more
	// Add 0.1% per month of staking
	durationMonths := stakeDurationBlocks / 129600 // blocks per month
	durationBonus := durationMonths / 10           // 0.1% per month

	totalReward := blockRewards * engagementMultiplier * (100 + durationBonus) / 100

	return totalReward
}
