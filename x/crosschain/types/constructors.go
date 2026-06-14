package types

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// NewMsgInitiateBridgeTransfer constructs a new MsgInitiateBridgeTransfer message.
func NewMsgInitiateBridgeTransfer(sender, recipient, targetChain string, amount sdk.Coin) *MsgInitiateBridgeTransfer {
	return &MsgInitiateBridgeTransfer{
		Sender:           sender,
		Recipient:        recipient,
		Amount:           amount,
		DestinationChain: targetChain,
	}
}

// NewMsgCompleteBridgeTransfer constructs a new MsgCompleteBridgeTransfer message.
func NewMsgCompleteBridgeTransfer(validator string, transferID uint64, proof string) *MsgCompleteBridgeTransfer {
	return &MsgCompleteBridgeTransfer{
		Validator:  validator,
		TransferId: transferID,
		Proof:      proof,
	}
}

// NewMsgUpdateParams constructs a new MsgUpdateParams message.
func NewMsgUpdateParams(authority string, params Params) *MsgUpdateParams {
	return &MsgUpdateParams{
		Authority: authority,
		Params:    params,
	}
}
