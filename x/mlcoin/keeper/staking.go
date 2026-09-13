package keeper

import (
	"context"
	"fmt"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// effectiveMinStakeAmount resolves the minimum stake amount enforced by
// Keeper.Stake. If Params.MinStakeAmount is zero (explicitly disabled by
// governance) we fall back to intervals.RewardDivisor so the floor-division
// reward bug never silently zeroes yield. If intervals is also unreadable the
// hardcoded DefaultMinStakeAmount constant is returned.
func (k Keeper) effectiveMinStakeAmount(ctx context.Context) uint64 {
	p, err := k.Params.Get(ctx)
	if err == nil && p.MinStakeAmount > 0 {
		return p.MinStakeAmount
	}
	intervals, err := k.GetModuleIntervals(ctx)
	if err == nil && intervals.RewardDivisor > 0 {
		return intervals.RewardDivisor
	}
	return types.DefaultMinStakeAmount
}

// Stake allows users to stake Mallcoins for rewards
func (k Keeper) Stake(ctx context.Context, address string, amount uint64) (string, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if amount == 0 {
		return "", errorsmod.Wrap(types.ErrInvalidRequest, "stake amount must be > 0")
	}

	// Enforce MinStakeAmount. Reject any stake smaller than the effective
	// minimum because it would produce zero block rewards (integer floor div
	// `stakedAmount / rewardDivisor` rounds to 0) but still lock funds for the
	// full lock period. This is a silent theft-of-principal unless we fail
	// the Msg here and surface the threshold to the caller.
	minStake := k.effectiveMinStakeAmount(ctx)
	if amount < minStake {
		return "", errorsmod.Wrapf(types.ErrStakeBelowMinimum,
			"stake amount %d < MinStakeAmount %d (raise stake or query /mlcoin/v1/params for the current threshold)",
			amount, minStake)
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
	if _, err := k.RecordTransaction(ctx, address, "staking", amount, "stake", "Staked for rewards"); err != nil {
		sdkCtx.Logger().Error("Failed to record stake transaction", "error", err)
	}

	// Record activity
	if err := k.RecordActivity(ctx, "stake", amount, address); err != nil {
		sdkCtx.Logger().Error("Failed to record stake activity", "error", err)
	}

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

	// Return the staked principal directly: Stake() only ever deducted it
	// from wallet.Balance, never from EmissionState.Circulating, so it was
	// never "un-emitted" and returning it here is not new supply — no mint
	// path needed, just an overflow-safe credit back.
	wallet, err := k.WalletBalance.Get(ctx, address)
	if err != nil {
		wallet = types.WalletBalance{Address: address, Balance: 0, Locked: 0}
	}
	newBalance, err := safeAdd(wallet.Balance, stakeInfo.StakedAmount)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidSupply, "wallet balance overflow on unstake")
	}
	wallet.Balance = newBalance
	if err := k.WalletBalance.Set(ctx, address, wallet); err != nil {
		return 0, err
	}

	// C-high: rewards ARE new supply (interest paid on staking) and were
	// previously credited with raw `wallet.Balance += rewards` — no
	// TotalSupply/DailyLimit check, no Circulating/EmittedTotal update, no
	// overflow guard. Route through the same governed MintToWallet path
	// every other source of new supply uses (BuyMallcoin, Mallpoints
	// conversion) instead of a second, ungoverned mint mechanism. If the
	// daily emission limit is already exhausted, forfeit the reward for
	// this unstake rather than blocking the user from ever recovering
	// their now-unlocked principal.
	totalReturn := stakeInfo.StakedAmount
	if rewards > 0 {
		if err := k.WithMintingEnabled(ctx, func() error { return k.MintToWallet(ctx, address, rewards) }); err != nil {
			sdkCtx.Logger().Info("staking reward mint skipped (principal still returned)", "address", address, "rewards", rewards, "error", err)
			rewards = 0
		} else {
			totalReturn, err = safeAdd(totalReturn, rewards)
			if err != nil {
				return 0, errorsmod.Wrap(types.ErrInvalidSupply, "stake return overflow")
			}
		}
	}

	// Mark stake inactive and persist closure details
	stakeInfo.IsActive = false
	stakeInfo.RewardsEarned = rewards
	if err := k.StakingRecords.Set(ctx, stakeID, stakeInfo); err != nil {
		return 0, errorsmod.Wrap(err, "failed to update staking record")
	}

	// Record transaction
	if _, err := k.RecordTransaction(ctx, "staking", address, totalReturn, "reward", "Staking rewards claimed"); err != nil {
		sdkCtx.Logger().Error("Failed to record unstake reward transaction", "error", err)
	}

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
	// Belt-and-suspenders: if stakedAmount < rewardDivisor, floor-div is 0.
	// (The upstream Stake() gate should have blocked this from ever reaching
	// the on-chain records, but we keep this check in case of historical or
	// governance-modified state.)
	if stakedAmount < rewardDivisor && stakeDurationBlocks > 0 {
		return 0
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
	durationBonus := durationMonths / 10 // 0.1% per month

	totalReward := blockRewards * engagementMultiplier * (100 + durationBonus) / 100

	return totalReward
}
