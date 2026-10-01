package types

import (
	"github.com/cosmos/cosmos-sdk/types"
)

// This file intentionally contains ONLY hand-written ValidateBasic methods for
// the MGP-20 messages. The message structs themselves (MsgApprove,
// MsgApproveResponse, MsgTransferFrom, MsgTransferFromResponse,
// QueryGetAllowanceRequest, QueryGetAllowanceResponse) are the authoritative
// protoc + protoc-gen-gocosmos output in tx.pb.go and query.pb.go (protobuf
// struct tags, Marshal/Unmarshal/Size wire encoding, Descriptor, and
// proto.RegisterType registration via file init()). Do not re-declare them here.

func (msg *MsgApprove) ValidateBasic() error {
	if msg.Owner == "" {
		return ErrInvalidRequest.Wrap("owner address cannot be empty")
	}
	if msg.Spender == "" {
		return ErrInvalidRequest.Wrap("spender address cannot be empty")
	}
	if _, err := types.AccAddressFromBech32(msg.Owner); err != nil {
		return ErrInvalidRequest.Wrap("invalid owner address")
	}
	if _, err := types.AccAddressFromBech32(msg.Spender); err != nil {
		return ErrInvalidRequest.Wrap("invalid spender address")
	}
	return nil
}

func (msg *MsgTransferFrom) ValidateBasic() error {
	if msg.Spender == "" {
		return ErrInvalidRequest.Wrap("spender address cannot be empty")
	}
	if msg.Owner == "" {
		return ErrInvalidRequest.Wrap("owner address cannot be empty")
	}
	if msg.Recipient == "" {
		return ErrInvalidRequest.Wrap("recipient address cannot be empty")
	}
	if _, err := types.AccAddressFromBech32(msg.Spender); err != nil {
		return ErrInvalidRequest.Wrap("invalid spender address")
	}
	if _, err := types.AccAddressFromBech32(msg.Owner); err != nil {
		return ErrInvalidRequest.Wrap("invalid owner address")
	}
	if _, err := types.AccAddressFromBech32(msg.Recipient); err != nil {
		return ErrInvalidRequest.Wrap("invalid recipient address")
	}
	if msg.Amount == 0 {
		return ErrInvalidRequest.Wrap("transfer amount must be greater than zero")
	}
	return nil
}
