package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) Approve(ctx context.Context, msg *types.MsgApprove) (*types.MsgApproveResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, errorsmod.Wrap(err, "invalid approve message")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if err := k.Keeper.Approve(ctx, msg.Owner, msg.Spender, msg.Amount); err != nil {
		return nil, errorsmod.Wrap(err, "failed to set allowance")
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"mgp20_approve",
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
		sdk.NewAttribute("owner", msg.Owner),
		sdk.NewAttribute("spender", msg.Spender),
		sdk.NewAttribute("amount", math.NewIntFromUint64(msg.Amount).String()),
	))

	return &types.MsgApproveResponse{}, nil
}

func (k msgServer) TransferFrom(ctx context.Context, msg *types.MsgTransferFrom) (*types.MsgTransferFromResponse, error) {
	if err := msg.ValidateBasic(); err != nil {
		return nil, errorsmod.Wrap(err, "invalid transfer_from message")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	txID, err := k.Keeper.TransferFrom(ctx, msg.Owner, msg.Spender, msg.Recipient, msg.Amount)
	if err != nil {
		return nil, errorsmod.Wrap(err, "transfer_from failed")
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"mgp20_transfer_from",
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
		sdk.NewAttribute("owner", msg.Owner),
		sdk.NewAttribute("spender", msg.Spender),
		sdk.NewAttribute("recipient", msg.Recipient),
		sdk.NewAttribute("amount", math.NewIntFromUint64(msg.Amount).String()),
		sdk.NewAttribute("tx_id", txID),
	))

	return &types.MsgTransferFromResponse{TxId: txID}, nil
}
