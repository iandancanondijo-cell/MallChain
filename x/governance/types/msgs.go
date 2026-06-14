package types

import (
	errorsmod "cosmossdk.io/errors"
	"github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterInterfaces registers the governance interfaces.
func RegisterInterfaces(registry types.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgSubmitProposal{},
		&MsgVote{},
		&MsgVoteWeighted{},
		&MsgDeposit{},
		&MsgUpdateParams{},
	)
}

// Interface implementations for tx.pb.go message types

// GetSigners returns the signer addresses for MsgSubmitProposal
func (m *MsgSubmitProposal) GetSigners() []sdk.AccAddress {
	proposer, _ := sdk.AccAddressFromBech32(m.Proposer)
	return []sdk.AccAddress{proposer}
}

// ValidateBasic performs basic validation for MsgSubmitProposal
func (m *MsgSubmitProposal) ValidateBasic() error {
	if m.Proposer == "" {
		return errorsmod.Wrap(ErrInvalidProposer, "proposer is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Proposer); err != nil {
		return errorsmod.Wrap(err, "invalid proposer address")
	}
	if m.Title == "" {
		return errorsmod.Wrap(ErrInvalidProposal, "title is required")
	}
	if m.Summary == "" {
		return errorsmod.Wrap(ErrInvalidProposal, "summary is required")
	}
	if len(m.Messages) == 0 {
		return errorsmod.Wrap(ErrInvalidProposal, "messages cannot be empty")
	}
	if !m.InitialDeposit.IsValid() {
		return errorsmod.Wrap(ErrInvalidProposal, "initial deposit is invalid")
	}
	if m.InitialDeposit.IsAnyNegative() {
		return errorsmod.Wrap(ErrInvalidProposal, "initial deposit cannot be negative")
	}
	return nil
}

// GetSigners returns the signer addresses for MsgVote
func (m *MsgVote) GetSigners() []sdk.AccAddress {
	voter, _ := sdk.AccAddressFromBech32(m.Voter)
	return []sdk.AccAddress{voter}
}

// ValidateBasic performs basic validation for MsgVote
func (m *MsgVote) ValidateBasic() error {
	if m.Voter == "" {
		return errorsmod.Wrap(ErrInvalidVoter, "voter is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Voter); err != nil {
		return errorsmod.Wrap(err, "invalid voter address")
	}
	if m.Option <= 0 {
		return errorsmod.Wrap(ErrInvalidVote, "option must be positive")
	}
	return nil
}

// GetSigners returns the signer addresses for MsgVoteWeighted
func (m *MsgVoteWeighted) GetSigners() []sdk.AccAddress {
	voter, _ := sdk.AccAddressFromBech32(m.Voter)
	return []sdk.AccAddress{voter}
}

// ValidateBasic performs basic validation for MsgVoteWeighted
func (m *MsgVoteWeighted) ValidateBasic() error {
	if m.Voter == "" {
		return errorsmod.Wrap(ErrInvalidVoter, "voter is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Voter); err != nil {
		return errorsmod.Wrap(err, "invalid voter address")
	}
	if len(m.WeightedOptions) == 0 {
		return errorsmod.Wrap(ErrInvalidVote, "weighted options cannot be empty")
	}
	return nil
}

// GetSigners returns the signer addresses for MsgDeposit
func (m *MsgDeposit) GetSigners() []sdk.AccAddress {
	depositor, _ := sdk.AccAddressFromBech32(m.Depositor)
	return []sdk.AccAddress{depositor}
}

// ValidateBasic performs basic validation for MsgDeposit
func (m *MsgDeposit) ValidateBasic() error {
	if m.Depositor == "" {
		return errorsmod.Wrap(ErrInvalidDepositor, "depositor is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Depositor); err != nil {
		return errorsmod.Wrap(err, "invalid depositor address")
	}
	if !m.Amount.IsValid() {
		return errorsmod.Wrap(ErrInvalidDeposit, "amount is invalid")
	}
	if m.Amount.IsAnyNegative() {
		return errorsmod.Wrap(ErrInvalidDeposit, "amount cannot be negative")
	}
	return nil
}

// GetSigners returns the signer addresses for MsgUpdateParams
func (m *MsgUpdateParams) GetSigners() []sdk.AccAddress {
	authority, _ := sdk.AccAddressFromBech32(m.Authority)
	return []sdk.AccAddress{authority}
}

// ValidateBasic performs basic validation for MsgUpdateParams
func (m *MsgUpdateParams) ValidateBasic() error {
	if m.Authority == "" {
		return errorsmod.Wrap(ErrInvalidAuthority, "authority is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Authority); err != nil {
		return errorsmod.Wrap(err, "invalid authority address")
	}
	return nil
}
