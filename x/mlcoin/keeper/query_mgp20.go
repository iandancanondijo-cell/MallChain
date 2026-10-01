package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) GetAllowance(ctx context.Context, req *types.QueryGetAllowanceRequest) (*types.QueryGetAllowanceResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	if req.Owner == "" || req.Spender == "" {
		return nil, status.Error(codes.InvalidArgument, "owner and spender must be specified")
	}

	allowance, err := q.k.GetAllowance(ctx, req.Owner, req.Spender)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryGetAllowanceResponse{Allowance: allowance}, nil
}
