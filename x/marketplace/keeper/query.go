package keeper

import (
	"context"

	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/marketplace/types"
)

var _ types.QueryServer = queryServer{}

// NewQueryServerImpl returns an implementation of the QueryServer interface
// for the provided Keeper.
func NewQueryServerImpl(k Keeper) types.QueryServer {
	return queryServer{k}
}

type queryServer struct {
	k Keeper
}

func (q queryServer) Escrow(ctx context.Context, req *types.QueryEscrowRequest) (*types.QueryEscrowResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	escrow, err := q.k.Escrows.Get(sdk.UnwrapSDKContext(ctx), req.EscrowId)
	if err != nil {
		if err == collections.ErrNotFound {
			return nil, status.Error(codes.NotFound, "escrow not found")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryEscrowResponse{Escrow: escrow}, nil
}

func (q queryServer) Escrows(ctx context.Context, req *types.QueryEscrowsRequest) (*types.QueryEscrowsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	escrows, err := q.k.GetAllEscrows(sdk.UnwrapSDKContext(ctx))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryEscrowsResponse{Escrows: escrows}, nil
}
