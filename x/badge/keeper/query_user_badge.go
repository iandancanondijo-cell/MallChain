package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"github.com/cosmos/cosmos-sdk/types/query"
	"marketplace/x/badge/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) ListUserBadge(ctx context.Context, req *types.QueryAllUserBadgeRequest) (*types.QueryAllUserBadgeResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	userBadges, pageRes, err := query.CollectionPaginate(
		ctx,
		q.k.UserBadge,
		req.Pagination,
		func(_ string, value types.UserBadge) (types.UserBadge, error) {
			return value, nil
		},
	)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryAllUserBadgeResponse{UserBadge: userBadges, Pagination: pageRes}, nil
}

func (q queryServer) GetUserBadge(ctx context.Context, req *types.QueryGetUserBadgeRequest) (*types.QueryGetUserBadgeResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	val, err := q.k.UserBadge.Get(ctx, req.Index)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "not found")
		}

		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetUserBadgeResponse{UserBadge: val}, nil
}
