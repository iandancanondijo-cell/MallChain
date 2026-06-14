package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/crosschain/types"
)

var _ types.QueryServer = queryServer{}

// NewQueryServerImpl returns an implementation of the crosschain QueryServer interface
// for the provided Keeper.
func NewQueryServerImpl(k Keeper) types.QueryServer {
	return &queryServer{k}
}

type queryServer struct {
	keeper Keeper
}

// BridgeTransfer implements types.QueryServer
func (q queryServer) BridgeTransfer(ctx context.Context, req *types.QueryBridgeTransferRequest) (*types.QueryBridgeTransferResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	transfer, err := q.keeper.GetBridgeTransfer(sdkCtx, req.TransferId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "bridge transfer not found")
	}

	return &types.QueryBridgeTransferResponse{
		Transfer: transfer,
	}, nil
}

// BridgeState implements types.QueryServer
func (q queryServer) BridgeState(ctx context.Context, req *types.QueryBridgeStateRequest) (*types.QueryBridgeStateResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	state, err := q.keeper.GetBridgeState(sdkCtx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryBridgeStateResponse{
		State: state,
	}, nil
}

// BridgeTransfers implements types.QueryServer
func (q queryServer) BridgeTransfers(ctx context.Context, req *types.QueryBridgeTransfersRequest) (*types.QueryBridgeTransfersResponse, error) {
	transfers, pageRes, err := q.keeper.GetAllBridgeTransfers(sdk.UnwrapSDKContext(ctx), req.Pagination)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryBridgeTransfersResponse{
		Transfers:  transfers,
		Pagination: pageRes,
	}, nil
}

// Params implements types.QueryServer
func (q queryServer) Params(ctx context.Context, req *types.QueryParamsRequest) (*types.QueryParamsResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	params, err := q.keeper.GetParams(sdkCtx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryParamsResponse{
		Params: params,
	}, nil
}
