package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
)

func (k msgServer) Stake(ctx context.Context, msg *types.MsgStake) (*types.MsgStakeResponse, error) {
	if msg.Amount == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "stake amount must be > 0")
	}

	stakeID, err := k.Keeper.Stake(ctx, msg.Creator, msg.Amount)
	if err != nil {
		return nil, err
	}

	return &types.MsgStakeResponse{StakeId: stakeID}, nil
}

func (k msgServer) Unstake(ctx context.Context, msg *types.MsgUnstake) (*types.MsgUnstakeResponse, error) {
	if msg.StakeId == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "stake_id is required")
	}

	rewards, err := k.Keeper.UnstakeAndClaimRewards(ctx, msg.Creator, msg.StakeId)
	if err != nil {
		return nil, err
	}

	return &types.MsgUnstakeResponse{RewardsEarned: rewards}, nil
}
