package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"github.com/cosmos/cosmos-sdk/types/query"
	"marketplace/x/mallpoints/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) ListUserPoints(ctx context.Context, req *types.QueryAllUserPointsRequest) (*types.QueryAllUserPointsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	userPointss, pageRes, err := query.CollectionPaginate(
		ctx,
		q.k.UserPoints,
		req.Pagination,
		func(_ string, value types.UserPoints) (types.UserPoints, error) {
			return value, nil
		},
	)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryAllUserPointsResponse{UserPoints: userPointss, Pagination: pageRes}, nil
}

func (q queryServer) GetUserPoints(ctx context.Context, req *types.QueryGetUserPointsRequest) (*types.QueryGetUserPointsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	val, err := q.k.UserPoints.Get(ctx, req.Index)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "not found")
		}

		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetUserPointsResponse{UserPoints: val}, nil
}
