package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"

	"marketplace/x/mallpoints/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) GetConversionWindow(ctx context.Context, req *types.QueryGetConversionWindowRequest) (*types.QueryGetConversionWindowResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	val, err := q.k.ConversionWindow.Get(ctx)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "not found")
		}

		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetConversionWindowResponse{ConversionWindow: val}, nil
}
