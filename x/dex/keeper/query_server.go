package keeper

import (
	"context"

	"cosmossdk.io/math"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/query"

	"marketplace/x/dex/types"
)

type queryServer struct {
	types.UnimplementedQueryServer
	k Keeper
}

func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{k: keeper}
}

var _ types.QueryServer = &queryServer{}

// Pool implements types.QueryServer
func (q queryServer) Pool(ctx context.Context, req *types.QueryPoolRequest) (*types.QueryPoolResponse, error) {
	pool, err := q.k.GetPool(ctx, req.PoolId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "pool not found")
	}

	return &types.QueryPoolResponse{Pool: &pool}, nil
}

// Pools implements types.QueryServer
func (q queryServer) Pools(ctx context.Context, req *types.QueryPoolsRequest) (*types.QueryPoolsResponse, error) {
	pools, err := q.k.GetAllPools(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Apply pagination
	start, end := req.Pagination.GetOffset(), req.Pagination.GetOffset()+req.Pagination.GetLimit()
	if end > uint64(len(pools)) {
		end = uint64(len(pools))
	}
	if start > end {
		start = end
	}

	paginatedPools := pools[start:end]
	resPools := make([]*types.Pool, len(paginatedPools))
	for i := range paginatedPools {
		resPools[i] = &paginatedPools[i]
	}

	return &types.QueryPoolsResponse{
		Pools:      resPools,
		Pagination: &query.PageResponse{Total: uint64(len(pools))},
	}, nil
}

// PoolLiquidity implements types.QueryServer
func (q queryServer) PoolLiquidity(ctx context.Context, req *types.QueryPoolLiquidityRequest) (*types.QueryPoolLiquidityResponse, error) {
	address, err := sdk.AccAddressFromBech32(req.Address)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid address")
	}

	liquidity, err := q.k.GetPoolLiquidity(ctx, req.PoolId, address)
	if err != nil {
		// Return zero liquidity if not found
		liquidity = sdk.NewCoin("", math.ZeroInt())
	}

	return &types.QueryPoolLiquidityResponse{Liquidity: &liquidity}, nil
}

// EstimateSwap implements types.QueryServer
func (q queryServer) EstimateSwap(ctx context.Context, req *types.QueryEstimateSwapRequest) (*types.QueryEstimateSwapResponse, error) {
	if req.TokenIn == nil {
		return nil, status.Error(codes.InvalidArgument, "token_in cannot be nil")
	}
	tokenOut, fee, err := q.k.EstimateSwap(ctx, req.PoolId, *req.TokenIn, req.TokenOutDenom)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	return &types.QueryEstimateSwapResponse{
		TokenOut: &tokenOut,
		Fee:      &fee,
	}, nil
}

// Params implements types.QueryServer
func (q queryServer) Params(ctx context.Context, req *types.QueryParamsRequest) (*types.QueryParamsResponse, error) {
	params, err := q.k.GetParams(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryParamsResponse{Params: &params}, nil
}
