package keeper

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/marketplace/types"
)

type msgServer struct {
	Keeper
}

func NewMsgServerImpl(k Keeper) types.MsgServer {
	return &msgServer{Keeper: k}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) CreateEscrow(sdkCtx interface{}, msg *types.MsgCreateEscrow) (*types.MsgCreateEscrowResponse, error) {
	ctx, ok := sdkCtx.(sdk.Context)
	if !ok {
		return nil, status.Error(codes.Internal, "invalid context type")
	}

	escrowID, err := m.Keeper.CreateEscrow(ctx, msg.Buyer, msg.Seller, msg.Amount, msg.Denom, msg.Description, msg.DisputeWindowSeconds)
	if err != nil {
		return nil, err
	}

	return &types.MsgCreateEscrowResponse{EscrowId: escrowID}, nil
}

func (m msgServer) ReleaseFunds(sdkCtx interface{}, msg *types.MsgReleaseFunds) (*types.MsgReleaseFundsResponse, error) {
	ctx, ok := sdkCtx.(sdk.Context)
	if !ok {
		return nil, status.Error(codes.Internal, "invalid context type")
	}

	if err := m.Keeper.ReleaseFunds(ctx, msg.EscrowId, msg.ReleaseBy); err != nil {
		return nil, err
	}

	return &types.MsgReleaseFundsResponse{}, nil
}

func (m msgServer) RefundBuyer(sdkCtx interface{}, msg *types.MsgRefundBuyer) (*types.MsgRefundBuyerResponse, error) {
	ctx, ok := sdkCtx.(sdk.Context)
	if !ok {
		return nil, status.Error(codes.Internal, "invalid context type")
	}

	if err := m.Keeper.RefundBuyer(ctx, msg.EscrowId); err != nil {
		return nil, err
	}

	return &types.MsgRefundBuyerResponse{}, nil
}

func (m msgServer) OpenDispute(sdkCtx interface{}, msg *types.MsgOpenDispute) (*types.MsgOpenDisputeResponse, error) {
	ctx, ok := sdkCtx.(sdk.Context)
	if !ok {
		return nil, status.Error(codes.Internal, "invalid context type")
	}

	if err := m.Keeper.OpenDispute(ctx, msg.EscrowId, msg.Opener); err != nil {
		return nil, err
	}

	return &types.MsgOpenDisputeResponse{}, nil
}