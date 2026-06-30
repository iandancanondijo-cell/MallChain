package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/crosschain/types"
)

type msgServer struct {
	*Keeper
}

// NewMsgServerImpl returns an implementation of the crosschain MsgServer interface
// for the provided Keeper.
func NewMsgServerImpl(keeper *Keeper) types.MsgServer {
	return &msgServer{Keeper: keeper}
}

var _ types.MsgServer = msgServer{}

// InitiateBridgeTransfer implements types.MsgServer
func (k msgServer) InitiateBridgeTransfer(ctx context.Context, msg *types.MsgInitiateBridgeTransfer) (*types.MsgInitiateBridgeTransferResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	transferId, err := k.Keeper.InitiateBridgeTransfer(sdkCtx, msg)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.MsgInitiateBridgeTransferResponse{
		TransferId: transferId,
	}, nil
}

// CompleteBridgeTransfer implements types.MsgServer
func (k msgServer) CompleteBridgeTransfer(ctx context.Context, msg *types.MsgCompleteBridgeTransfer) (*types.MsgCompleteBridgeTransferResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	err := k.Keeper.CompleteBridgeTransfer(sdkCtx, msg)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.MsgCompleteBridgeTransferResponse{}, nil
}

// UpdateParams implements types.MsgServer
func (k msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	authority, err := k.Keeper.GetAuthority(sdkCtx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if authority != msg.Authority {
		return nil, status.Error(codes.PermissionDenied, "unauthorized")
	}

	err = k.Keeper.SetParams(sdkCtx, msg.Params)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeParamsUpdated,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
	))

	return &types.MsgUpdateParamsResponse{}, nil
}
