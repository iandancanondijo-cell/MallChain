package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	"marketplace/x/mlcoin/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

func TestMsgStakeAndUnstake(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(&f.keeper)
	queryServer := keeper.NewQueryServerImpl(&f.keeper)
	staker := "mall1staker"

	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, staker, types.WalletBalance{Address: staker, Balance: 30_000}))
	require.NoError(t, f.keeper.SetModuleIntervals(f.ctx, types.ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   100,
		StakingLockBlocks:    50,
		RewardDivisor:        100,
	}))

	// Zero amount is rejected.
	_, err := msgServer.Stake(f.ctx, &types.MsgStake{Creator: staker, Amount: 0})
	require.Error(t, err)

	// Stake 20000 of the 30000 available. RewardDivisor=100 → effective
	// MinStakeAmount=100 (no explicit Params.MinStakeAmount override in
	// the fixture), so 20000 is well above the C3 acceptance gate.
	stakeRes, err := msgServer.Stake(f.ctx, &types.MsgStake{Creator: staker, Amount: 20_000})
	require.NoError(t, err)
	require.NotEmpty(t, stakeRes.StakeId)

	wallet, err := f.keeper.WalletBalance.Get(f.ctx, staker)
	require.NoError(t, err)
	require.Equal(t, uint64(10_000), wallet.Balance)

	// Query should show one active record for the staker, owning the returned stake_id.
	queryRes, err := queryServer.GetStakingRecords(f.ctx, &types.QueryGetStakingRecordsRequest{Address: staker})
	require.NoError(t, err)
	require.Len(t, queryRes.StakingRecords, 1)
	require.Equal(t, stakeRes.StakeId, queryRes.StakingRecords[0].StakeId)
	require.True(t, queryRes.StakingRecords[0].Info.IsActive)
	require.Equal(t, uint64(20_000), queryRes.StakingRecords[0].Info.StakedAmount)

	// Unstake before the lock period ends is rejected.
	_, err = msgServer.Unstake(f.ctx, &types.MsgUnstake{Creator: staker, StakeId: stakeRes.StakeId})
	require.Error(t, err)

	// A different address may not unstake someone else's stake.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(1000)
	_, err = msgServer.Unstake(sdkCtx, &types.MsgUnstake{Creator: "mall1someoneelse", StakeId: stakeRes.StakeId})
	require.Error(t, err)

	// Past the lock period, the rightful owner can unstake.
	unstakeRes, err := msgServer.Unstake(sdkCtx, &types.MsgUnstake{Creator: staker, StakeId: stakeRes.StakeId})
	require.NoError(t, err)

	wallet, err = f.keeper.WalletBalance.Get(sdkCtx, staker)
	require.NoError(t, err)
	require.Equal(t, uint64(10_000)+20_000+unstakeRes.RewardsEarned, wallet.Balance)

	// The record is no longer active.
	queryRes, err = queryServer.GetStakingRecords(sdkCtx, &types.QueryGetStakingRecordsRequest{Address: staker})
	require.NoError(t, err)
	require.Len(t, queryRes.StakingRecords, 1)
	require.False(t, queryRes.StakingRecords[0].Info.IsActive)

	// A second unstake attempt on the same stake fails (already inactive).
	_, err = msgServer.Unstake(sdkCtx, &types.MsgUnstake{Creator: staker, StakeId: stakeRes.StakeId})
	require.Error(t, err)
}

func TestMsgStake_InsufficientBalance(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(&f.keeper)
	staker := "mall1poorstaker"

	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, staker, types.WalletBalance{Address: staker, Balance: 100}))
	require.NoError(t, f.keeper.SetModuleIntervals(f.ctx, types.ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   100,
		StakingLockBlocks:    50,
		RewardDivisor:        10,
	}))

	// 500 > 100 (balance), but also > RewardDivisor=10 → fails AFTER the
	// C3 MinStakeAmount gate, which is exactly the insufficient-balance
	// path this fixture targets.
	_, err := msgServer.Stake(f.ctx, &types.MsgStake{Creator: staker, Amount: 500})
	require.Error(t, err)

	// Balance must be unchanged after the rejected stake.
	wallet, err := f.keeper.WalletBalance.Get(f.ctx, staker)
	require.NoError(t, err)
	require.Equal(t, uint64(100), wallet.Balance)
}

func TestMsgStake_WalletNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(&f.keeper)

	require.NoError(t, f.keeper.SetModuleIntervals(f.ctx, types.ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   100,
		StakingLockBlocks:    50,
		RewardDivisor:        10,
	}))

	// Amount 200 passes RewardDivisor=10 → error surface is wallet-not-found
	// (the intended validation target for this fixture).
	_, err := msgServer.Stake(f.ctx, &types.MsgStake{Creator: "mall1neverfunded", Amount: 200})
	require.Error(t, err)
}

func TestMsgUnstake_StakeNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(&f.keeper)

	_, err := msgServer.Unstake(f.ctx, &types.MsgUnstake{Creator: "mall1staker", StakeId: "stake-does-not-exist"})
	require.Error(t, err)
}

func TestMsgUnstake_EmptyStakeId(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(&f.keeper)

	_, err := msgServer.Unstake(f.ctx, &types.MsgUnstake{Creator: "mall1staker", StakeId: ""})
	require.Error(t, err)
}

func TestGetStakingRecords_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(&f.keeper)

	_, err := queryServer.GetStakingRecords(f.ctx, nil)
	require.Error(t, err)
}

func TestGetStakingRecords_NoRecordsForAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(&f.keeper)

	res, err := queryServer.GetStakingRecords(f.ctx, &types.QueryGetStakingRecordsRequest{Address: "mall1neverstaked"})
	require.NoError(t, err)
	require.Empty(t, res.StakingRecords)
}
