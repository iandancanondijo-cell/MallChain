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

	// Create staking record with configurable lock period
	seq, err := k.StakingSequence.Next(ctx)
	if err != nil {
		return "", err
	}
	intervals, err := k.GetModuleIntervals(ctx)
	if err != nil {
		return "", err
	}
	lockBlocks := intervals.StakingLockBlocks
	if lockBlocks == 0 {
		lockBlocks = types.DefaultModuleIntervals().StakingLockBlocks
	}
	stakeID := fmt.Sprintf("stake-%d-%s", seq, address)
	stakeInfo := types.StakingInfo{
		Address:       address,
		StakedAmount:  amount,
		StakeDate:     int64(sdkCtx.BlockHeight()),
		RewardsEarned: 0,
		IsActive:      true,
		UnlockHeight:  uint64(sdkCtx.BlockHeight()) + lockBlocks,
	}

	// Persist staking record
	if err := k.StakingRecords.Set(ctx, stakeID, stakeInfo); err != nil {
		return "", err
	}

	// Record transaction
	_, _ = k.RecordTransaction(ctx, address, "staking", amount, "stake", "Staked for rewards")

	// Record activity
	_ = k.RecordActivity(ctx, "stake", amount, address)

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeStake,
		sdk.NewAttribute(types.AttributeKeyAddress, address),
		sdk.NewAttribute(types.AttributeKeyStakeID, stakeID),
		sdk.NewAttribute(types.AttributeKeyAmount, fmt.Sprintf("%d", amount)),
	))

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

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeUnstake,
		sdk.NewAttribute(types.AttributeKeyAddress, address),
		sdk.NewAttribute(types.AttributeKeyStakeID, stakeID),
		sdk.NewAttribute(types.AttributeKeyAmount, fmt.Sprintf("%d", totalReturn)),
	))

	return rewards, nil
}

// CalculateRewardsForStaking calculates staking rewards based on multiple factors
func (k Keeper) CalculateRewardsForStaking(ctx context.Context, stakedAmount, stakeDurationBlocks uint64) uint64 {
	intervals, err := k.GetModuleIntervals(ctx)
	if err != nil {
		intervals = types.DefaultModuleIntervals()
	}
	// Get activity metrics for engagement multiplier
	metrics, err := k.ActivityMetrics.Get(ctx)
	if err != nil {
		metrics = types.ActivityMetrics{EngagementScore: 500} // default middle score
	}

	rewardDivisor := intervals.RewardDivisor
	if rewardDivisor == 0 {
		rewardDivisor = types.DefaultModuleIntervals().RewardDivisor
	}
	blockRewards := stakedAmount / rewardDivisor

	// Apply engagement multiplier (0.5x to 1.5x)
	engagementMultiplier := metrics.EngagementScore / 1000
	if engagementMultiplier == 0 {
		engagementMultiplier = 1
	}

	blocksPerMonth := intervals.BlocksPerMonth
	if blocksPerMonth == 0 {
		blocksPerMonth = types.DefaultModuleIntervals().BlocksPerMonth
	}
	durationMonths := stakeDurationBlocks / blocksPerMonth
	durationBonus := durationMonths / 10           // 0.1% per month

	totalReward := blockRewards * engagementMultiplier * (100 + durationBonus) / 100

	return totalReward
}
