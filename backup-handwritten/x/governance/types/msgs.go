// Code generated manually from governance proto files. DO NOT EDIT.
// This should be regenerated with buf/ignite when available.

package types

import (
	"encoding/json"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	anyproto "github.com/cosmos/gogoproto/types/any"
)

// NewMsgSubmitProposal creates a new MsgSubmitProposal.
func NewMsgSubmitProposal(messages []*anyproto.Any, initialDeposit sdk.Coins, proposer, metadata, title, summary string, expedited bool) (*MsgSubmitProposal, error) {
	m := &MsgSubmitProposal{
		Proposer:       proposer,
		Metadata:       metadata,
		Title:          title,
		Summary:        summary,
		Messages:       messages,
		InitialDeposit: initialDeposit,
		Expedited:      expedited,
	}
	return m, nil
}

// Route returns the message route.
func (m *MsgSubmitProposal) Route() string { return ModuleName }

// Type returns the message type.
func (m *MsgSubmitProposal) Type() string { return "submit_proposal" }

// GetSigners returns the signer addresses.
func (m *MsgSubmitProposal) GetSigners() []sdk.AccAddress {
	proposer, _ := sdk.AccAddressFromBech32(m.Proposer)
	return []sdk.AccAddress{proposer}
}

// GetSignBytes returns the sign bytes.
func (m *MsgSubmitProposal) GetSignBytes() []byte {
	bz, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return sdk.MustSortJSON(bz)
}

// ValidateBasic performs basic validation.
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

// NewMsgVote creates a new MsgVote.
func NewMsgVote(voter string, proposalID uint64, option VoteOption, metadata string) *MsgVote {
	return &MsgVote{
		ProposalId: proposalID,
		Voter:      voter,
		Option:     option,
		Metadata:   metadata,
	}
}

// Route returns the message route.
func (m *MsgVote) Route() string { return ModuleName }

// Type returns the message type.
func (m *MsgVote) Type() string { return "vote" }

// GetSigners returns the signer addresses.
func (m *MsgVote) GetSigners() []sdk.AccAddress {
	voter, _ := sdk.AccAddressFromBech32(m.Voter)
	return []sdk.AccAddress{voter}
}

// GetSignBytes returns the sign bytes.
func (m *MsgVote) GetSignBytes() []byte {
	bz, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return sdk.MustSortJSON(bz)
}

// ValidateBasic performs basic validation.
func (m *MsgVote) ValidateBasic() error {
	if m.Voter == "" {
		return errorsmod.Wrap(ErrInvalidVoter, "voter is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Voter); err != nil {
		return errorsmod.Wrap(err, "invalid voter address")
	}
	if m.ProposalId == 0 {
		return errorsmod.Wrap(ErrInvalidProposal, "proposal id cannot be 0")
	}
	if m.Option == VoteOption_VOTE_OPTION_UNSPECIFIED {
		return errorsmod.Wrap(ErrInvalidVote, "vote option cannot be empty")
	}
	return nil
}

// NewMsgVoteWeighted creates a new MsgVoteWeighted.
func NewMsgVoteWeighted(voter string, proposalID uint64, weightedOptions []WeightedVoteOption, metadata string) *MsgVoteWeighted {
	return &MsgVoteWeighted{
		ProposalId:      proposalID,
		Voter:           voter,
		WeightedOptions: weightedOptions,
		Metadata:        metadata,
	}
}

// Route returns the message route.
func (m *MsgVoteWeighted) Route() string { return ModuleName }

// Type returns the message type.
func (m *MsgVoteWeighted) Type() string { return "vote_weighted" }

// GetSigners returns the signer addresses.
func (m *MsgVoteWeighted) GetSigners() []sdk.AccAddress {
	voter, _ := sdk.AccAddressFromBech32(m.Voter)
	return []sdk.AccAddress{voter}
}

// GetSignBytes returns the sign bytes.
func (m *MsgVoteWeighted) GetSignBytes() []byte {
	bz, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return sdk.MustSortJSON(bz)
}

// ValidateBasic performs basic validation.
func (m *MsgVoteWeighted) ValidateBasic() error {
	if m.Voter == "" {
		return errorsmod.Wrap(ErrInvalidVoter, "voter is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Voter); err != nil {
		return errorsmod.Wrap(err, "invalid voter address")
	}
	if m.ProposalId == 0 {
		return errorsmod.Wrap(ErrInvalidProposal, "proposal id cannot be 0")
	}
	if len(m.WeightedOptions) == 0 {
		return errorsmod.Wrap(ErrInvalidVote, "weighted options cannot be empty")
	}

	totalWeight := math.LegacyZeroDec()
	for _, option := range m.WeightedOptions {
		if option.Weight.IsNegative() {
			return errorsmod.Wrap(ErrInvalidVote, "vote weight cannot be negative")
		}
		totalWeight = totalWeight.Add(option.Weight)
	}

	if !totalWeight.Equal(math.LegacyOneDec()) {
		return errorsmod.Wrap(ErrInvalidVote, "vote weights must sum to 1")
	}

	return nil
}

// NewMsgDeposit creates a new MsgDeposit.
func NewMsgDeposit(depositor string, proposalID uint64, amount sdk.Coins) *MsgDeposit {
	return &MsgDeposit{
		ProposalId: proposalID,
		Depositor:  depositor,
		Amount:     amount,
	}
}

// Route returns the message route.
func (m *MsgDeposit) Route() string { return ModuleName }

// Type returns the message type.
func (m *MsgDeposit) Type() string { return "deposit" }

// GetSigners returns the signer addresses.
func (m *MsgDeposit) GetSigners() []sdk.AccAddress {
	depositor, _ := sdk.AccAddressFromBech32(m.Depositor)
	return []sdk.AccAddress{depositor}
}

// GetSignBytes returns the sign bytes.
func (m *MsgDeposit) GetSignBytes() []byte {
	bz, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return sdk.MustSortJSON(bz)
}

// ValidateBasic performs basic validation.
func (m *MsgDeposit) ValidateBasic() error {
	if m.Depositor == "" {
		return errorsmod.Wrap(ErrInvalidDepositor, "depositor is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Depositor); err != nil {
		return errorsmod.Wrap(err, "invalid depositor address")
	}
	if m.ProposalId == 0 {
		return errorsmod.Wrap(ErrInvalidProposal, "proposal id cannot be 0")
	}
	if !m.Amount.IsValid() {
		return errorsmod.Wrap(ErrInvalidDeposit, "amount is invalid")
	}
	if m.Amount.IsAnyNegative() {
		return errorsmod.Wrap(ErrInvalidDeposit, "amount cannot be negative")
	}
	return nil
}

// NewMsgUpdateParams creates a new MsgUpdateParams.
func NewMsgUpdateParams(authority string, params Params) *MsgUpdateParams {
	return &MsgUpdateParams{
		Authority: authority,
		Params:    params,
	}
}

// Route returns the message route.
func (m *MsgUpdateParams) Route() string { return ModuleName }

// Type returns the message type.
func (m *MsgUpdateParams) Type() string { return "update_params" }

// GetSigners returns the signer addresses.
func (m *MsgUpdateParams) GetSigners() []sdk.AccAddress {
	authority, _ := sdk.AccAddressFromBech32(m.Authority)
	return []sdk.AccAddress{authority}
}

// GetSignBytes returns the sign bytes.
func (m *MsgUpdateParams) GetSignBytes() []byte {
	bz, err := json.Marshal(m)
	if err != nil {
		panic(err)
	}
	return sdk.MustSortJSON(bz)
}

// ValidateBasic performs basic validation.
func (m *MsgUpdateParams) ValidateBasic() error {
	if m.Authority == "" {
		return errorsmod.Wrap(ErrInvalidAuthority, "authority is required")
	}
	if _, err := sdk.AccAddressFromBech32(m.Authority); err != nil {
		return errorsmod.Wrap(err, "invalid authority address")
	}
	return nil
}
