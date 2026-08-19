package keeper

import (
	"context"
	"encoding/json"

	errorsmod "cosmossdk.io/errors"
	wasmtypes "marketplace/x/wasmbridge/types"
)

type MsgServer struct {
	Keeper
}

func NewMsgServerImpl(keeper Keeper) *MsgServer {
	return &MsgServer{Keeper: keeper}
}

func (m MsgServer) ExecuteAction(ctx context.Context, msg *wasmtypes.MsgExecuteAction) (*wasmtypes.MsgExecuteActionResponse, error) {
	switch msg.Action {
	case wasmtypes.ActionTransfer:
		var transferMsg wasmtypes.MGP20TransferMsg
		if err := json.Unmarshal(msg.Message, &transferMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		// A transfer moves funds out of transferMsg.From, so only that
		// account's own signature may authorize it.
		if msg.Sender != transferMsg.From {
			return nil, errorsmod.Wrapf(wasmtypes.ErrUnauthorized, "sender %s is not authorized to transfer from %s", msg.Sender, transferMsg.From)
		}
		if err := m.HandleTransfer(ctx, transferMsg); err != nil {
			return nil, err
		}

	case wasmtypes.ActionApprove:
		var approveMsg wasmtypes.MGP20ApproveMsg
		if err := json.Unmarshal(msg.Message, &approveMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		// Only the owner may grant an allowance over their own balance.
		if msg.Sender != approveMsg.Owner {
			return nil, errorsmod.Wrapf(wasmtypes.ErrUnauthorized, "sender %s is not authorized to approve on behalf of %s", msg.Sender, approveMsg.Owner)
		}
		if err := m.HandleApprove(ctx, approveMsg); err != nil {
			return nil, err
		}

	case wasmtypes.ActionTransferFrom:
		var transferFromMsg wasmtypes.MGP20TransferFromMsg
		if err := json.Unmarshal(msg.Message, &transferFromMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		// transfer_from spends the owner's allowance, so only the
		// approved spender may invoke it — matches standard MGP20/ERC20
		// transferFrom semantics.
		if msg.Sender != transferFromMsg.Spender {
			return nil, errorsmod.Wrapf(wasmtypes.ErrUnauthorized, "sender %s is not the approved spender %s", msg.Sender, transferFromMsg.Spender)
		}
		if err := m.HandleTransferFrom(ctx, transferFromMsg); err != nil {
			return nil, err
		}

	default:
		return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, "unknown action: "+msg.Action)
	}

	return &wasmtypes.MsgExecuteActionResponse{Success: true}, nil
}
