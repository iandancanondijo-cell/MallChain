package keeper

import (
	"context"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	"github.com/cosmos/cosmos-sdk/types/query"
	"marketplace/x/mlcoin/types"
)

func (q queryServer) GetTransaction(ctx context.Context, req *types.QueryGetTransactionRequest) (*types.QueryGetTransactionResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "invalid request")
	}

	transaction, err := q.k.Transactions.Get(ctx, req.TxId)
	if err != nil {
		if errorsmod.IsOf(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrapf(types.ErrTransactionNotFound, "transaction %s not found", req.TxId)
		}
		return nil, err
	}

	return &types.QueryGetTransactionResponse{Transaction: transaction}, nil
}

func (q queryServer) ListTransactions(ctx context.Context, req *types.QueryAllTransactionsRequest) (*types.QueryAllTransactionsResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "invalid request")
	}

	var transactions []types.Transaction

	results, pageRes, err := query.CollectionPaginate(
		ctx,
		q.k.Transactions,
		req.Pagination,
		func(key string, value types.Transaction) (types.Transaction, error) {
			return value, nil
		},
	)

	if err != nil {
		return nil, err
	}

	transactions = results

	return &types.QueryAllTransactionsResponse{
		Transactions: transactions,
		Pagination:   pageRes,
	}, nil
}

func (q queryServer) GetTransactionsByAddress(ctx context.Context, req *types.QueryGetTransactionsByAddressRequest) (*types.QueryGetTransactionsByAddressResponse, error) {
	if req == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "invalid request")
	}

	var transactions []types.Transaction

	err := q.k.Transactions.Walk(ctx, nil, func(key string, tx types.Transaction) (stop bool, err error) {
		if tx.From == req.Address || tx.To == req.Address {
			transactions = append(transactions, tx)
		}
		return false, nil
	})

	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to walk transactions")
	}

	return &types.QueryGetTransactionsByAddressResponse{
		Transactions: transactions,
		Pagination:   &query.PageResponse{Total: uint64(len(transactions))},
	}, nil
}
