package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"github.com/cosmos/cosmos-sdk/types/query"
	"marketplace/x/mlcoin/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) ListWalletBalance(ctx context.Context, req *types.QueryAllWalletBalanceRequest) (*types.QueryAllWalletBalanceResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	walletBalances, pageRes, err := query.CollectionPaginate(
		ctx,
		q.k.WalletBalance,
		req.Pagination,
		func(_ string, value types.WalletBalance) (types.WalletBalance, error) {
			return value, nil
		},
	)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryAllWalletBalanceResponse{WalletBalance: walletBalances, Pagination: pageRes}, nil
}

func (q queryServer) GetWalletBalance(ctx context.Context, req *types.QueryGetWalletBalanceRequest) (*types.QueryGetWalletBalanceResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	val, err := q.k.WalletBalance.Get(ctx, req.Index)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "not found")
		}

		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetWalletBalanceResponse{WalletBalance: val}, nil
}
