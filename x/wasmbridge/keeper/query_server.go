package keeper

import (
	"context"

	types "marketplace/x/wasmbridge/types"
)

type QueryServer struct {
	Keeper
}

func NewQueryServerImpl(keeper Keeper) *QueryServer {
	return &QueryServer{Keeper: keeper}
}

func (q QueryServer) Balance(ctx context.Context, req *types.QueryBalanceRequest) (*types.QueryBalanceResponse, error) {
	balance, err := q.QueryBalance(ctx, req.Address)
	if err != nil {
		return nil, err
	}
	return &types.QueryBalanceResponse{
		Balance: balance,
	}, nil
}

func (q QueryServer) Allowance(ctx context.Context, req *types.QueryAllowanceRequest) (*types.QueryAllowanceResponse, error) {
	allowance, err := q.QueryAllowance(ctx, req.Owner, req.Spender)
	if err != nil {
		return nil, err
	}
	return &types.QueryAllowanceResponse{
		Allowance: allowance,
	}, nil
}