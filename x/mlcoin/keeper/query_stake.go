package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
)

func (q queryServer) GetStakingRecords(ctx context.Context, req *types.QueryGetStakingRecordsRequest) (*types.QueryGetStakingRecordsResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "invalid request")
	}

	var records []types.StakingRecordEntry

	err := q.k.StakingRecords.Walk(ctx, nil, func(key string, info types.StakingInfo) (stop bool, err error) {
		if info.Address == req.Address {
			records = append(records, types.StakingRecordEntry{StakeId: key, Info: info})
		}
		return false, nil
	})

	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to walk staking records")
	}

	return &types.QueryGetStakingRecordsResponse{
		StakingRecords: records,
	}, nil
}
