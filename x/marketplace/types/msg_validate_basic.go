package types

import (
	"cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// maxEscrowDescriptionLen bounds description so a single MsgCreateEscrow
// can't bloat chain state with an arbitrarily large string — there was
// previously no limit at all.
const maxEscrowDescriptionLen = 2000

// This SDK's ante handler doesn't auto-invoke a HasValidateBasic message
// (that decorator was dropped from the default chain in newer cosmos-sdk
// versions), so these are called explicitly at the top of each msg_server
// handler (keeper/msg_server.go) — matching how every other module in this
// codebase (badge, edu, mallpoints, ...) validates inline rather than
// relying on it being invoked automatically.

func (msg *MsgCreateEscrow) ValidateBasic() error {
	buyerAddr, err := sdk.AccAddressFromBech32(msg.Buyer)
	if err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid buyer address")
	}
	sellerAddr, err := sdk.AccAddressFromBech32(msg.Seller)
	if err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid seller address")
	}
	if buyerAddr.Equals(sellerAddr) {
		return errors.Wrap(ErrInvalidRequest, "buyer and seller cannot be the same address")
	}
	if err := sdk.ValidateDenom(msg.Denom); err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid denom")
	}
	amount, ok := math.NewIntFromString(msg.Amount)
	if !ok {
		return errors.Wrap(ErrInvalidRequest, "invalid amount format")
	}
	if !amount.IsPositive() {
		return errors.Wrap(ErrInvalidRequest, "amount must be positive")
	}
	if len(msg.Description) > maxEscrowDescriptionLen {
		return errors.Wrapf(ErrInvalidRequest, "description exceeds %d characters", maxEscrowDescriptionLen)
	}
	return nil
}

func (msg *MsgReleaseFunds) ValidateBasic() error {
	if msg.EscrowId == "" {
		return errors.Wrap(ErrInvalidRequest, "escrow_id cannot be empty")
	}
	if _, err := sdk.AccAddressFromBech32(msg.ReleaseBy); err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid release_by address")
	}
	return nil
}

func (msg *MsgRefundBuyer) ValidateBasic() error {
	if msg.EscrowId == "" {
		return errors.Wrap(ErrInvalidRequest, "escrow_id cannot be empty")
	}
	if _, err := sdk.AccAddressFromBech32(msg.RequestedBy); err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid requested_by address")
	}
	return nil
}

func (msg *MsgOpenDispute) ValidateBasic() error {
	if msg.EscrowId == "" {
		return errors.Wrap(ErrInvalidRequest, "escrow_id cannot be empty")
	}
	if _, err := sdk.AccAddressFromBech32(msg.Opener); err != nil {
		return errors.Wrap(ErrInvalidRequest, "invalid opener address")
	}
	return nil
}
