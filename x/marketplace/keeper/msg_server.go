package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/marketplace/types"
)

type msgServer struct {
	Keeper
}

func NewMsgServerImpl(k Keeper) types.MsgServer {
	return &msgServer{Keeper: k}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) CreateEscrow(ctx context.Context, msg *types.MsgCreateEscrow) (*types.MsgCreateEscrowResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	escrowID, err := m.Keeper.CreateEscrow(sdkCtx, msg.Buyer, msg.Seller, msg.Amount, msg.Denom, msg.Description, msg.DisputeWindowSeconds)
	if err != nil {
		return nil, err
	}

	return &types.MsgCreateEscrowResponse{EscrowId: escrowID}, nil
}

func (m msgServer) ReleaseFunds(ctx context.Context, msg *types.MsgReleaseFunds) (*types.MsgReleaseFundsResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if err := m.Keeper.ReleaseFunds(sdkCtx, msg.EscrowId, msg.ReleaseBy); err != nil {
		return nil, err
	}

	return &types.MsgReleaseFundsResponse{}, nil
}

func (m msgServer) RefundBuyer(ctx context.Context, msg *types.MsgRefundBuyer) (*types.MsgRefundBuyerResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if err := m.Keeper.RefundBuyer(sdkCtx, msg.EscrowId, msg.RequestedBy); err != nil {
		return nil, err
	}

	return &types.MsgRefundBuyerResponse{}, nil
}

func (m msgServer) OpenDispute(ctx context.Context, msg *types.MsgOpenDispute) (*types.MsgOpenDisputeResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if err := m.Keeper.OpenDispute(sdkCtx, msg.EscrowId, msg.Opener); err != nil {
		return nil, err
	}

	return &types.MsgOpenDisputeResponse{}, nil
}
