package types

import (
	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
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
		&MsgSlashValidator{},
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

// ValidateBasic performs basic validation for MsgVoteWeighted.
//
// C-critical: this previously only checked the options slice was non-empty.
// Weights were never bounded, so a single vote with e.g. weight "999999999"
// on one option let TallyVotes count it as that many times a normal vote —
// trivially defeating quorum/threshold and letting a proposal (which can
// execute arbitrary messages, including bank sends, mints, and slashes) pass
// with no real backing stake. Weights must now be valid probabilities over
// the chosen options: each in (0, 1], no duplicate/unspecified options, and
// the total exactly 1 — the standard Cosmos SDK weighted-vote invariant.
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

	seen := make(map[VoteOption]bool, len(m.WeightedOptions))
	totalWeight := math.LegacyZeroDec()
	for _, wo := range m.WeightedOptions {
		if wo.Option == VoteOption_VOTE_OPTION_UNSPECIFIED {
			return errorsmod.Wrap(ErrInvalidVote, "vote option must be specified")
		}
		if seen[wo.Option] {
			return errorsmod.Wrap(ErrInvalidVote, "duplicate vote option")
		}
		seen[wo.Option] = true

		if wo.Weight.IsNil() || wo.Weight.LTE(math.LegacyZeroDec()) || wo.Weight.GT(math.LegacyOneDec()) {
			return errorsmod.Wrap(ErrInvalidVote, "each option weight must be in (0, 1]")
		}
		totalWeight = totalWeight.Add(wo.Weight)
	}
	if !totalWeight.Equal(math.LegacyOneDec()) {
		return errorsmod.Wrap(ErrInvalidVote, "option weights must sum to exactly 1")
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

// GetSigners returns the signer addresses for MsgSlashValidator
func (m *MsgSlashValidator) GetSigners() []sdk.AccAddress {
	authority, _ := sdk.AccAddressFromBech32(m.Authority)
	return []sdk.AccAddress{authority}
}

// ValidateBasic performs basic validation for MsgSlashValidator
func (m *MsgSlashValidator) ValidateBasic() error {
	if m.Authority == "" {
		return errorsmod.Wrap(ErrInvalidAuthority, "authority is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Authority); err != nil {
		return errorsmod.Wrap(err, "invalid authority address")
	}
	if m.ValidatorAddress == "" {
		return errorsmod.Wrap(ErrInvalidProposal, "validator_address is required")
	}
	if _, err := sdk.ValAddressFromBech32(m.ValidatorAddress); err != nil {
		return errorsmod.Wrap(err, "invalid validator address")
	}
	if m.SlashPercentage > 100 {
		return errorsmod.Wrap(ErrInvalidProposal, "slash_percentage cannot exceed 100")
	}
	return nil
}
