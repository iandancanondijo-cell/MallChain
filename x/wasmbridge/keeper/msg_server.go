package keeper

import (
	"context"
	"encoding/json"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	wasmtypes "marketplace/x/wasmbridge/types"
)

type MsgServer struct {
	Keeper
}

func NewMsgServerImpl(keeper Keeper) *MsgServer {
	return &MsgServer{Keeper: keeper}
}

func (m MsgServer) ExecuteContract(ctx context.Context, msg *wasmtypes.MsgExecuteContract) (*wasmtypes.MsgExecuteContractResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	_ = sdkCtx

	switch msg.Action {
	case wasmtypes.ActionTransfer:
		var transferMsg wasmtypes.MGP20TransferMsg
		if err := json.Unmarshal(msg.Message, &transferMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		if err := m.HandleTransfer(ctx, transferMsg); err != nil {
			return nil, err
		}

	case wasmtypes.ActionApprove:
		var approveMsg wasmtypes.MGP20ApproveMsg
		if err := json.Unmarshal(msg.Message, &approveMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		if err := m.HandleApprove(ctx, approveMsg); err != nil {
			return nil, err
		}

	case wasmtypes.ActionTransferFrom:
		var transferFromMsg wasmtypes.MGP20TransferFromMsg
		if err := json.Unmarshal(msg.Message, &transferFromMsg); err != nil {
			return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, err.Error())
		}
		if err := m.HandleTransferFrom(ctx, transferFromMsg); err != nil {
			return nil, err
		}

	default:
		return nil, errorsmod.Wrap(wasmtypes.ErrInvalidRequest, "unknown action: "+msg.Action)
	}

	return &wasmtypes.MsgExecuteContractResponse{Success: true}, nil
}