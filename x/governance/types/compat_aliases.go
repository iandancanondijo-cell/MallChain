package types

import (
	"time"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Compatibility aliases so existing keeper code referencing
// StatusDepositPeriod, etc. keep compiling against generated enums.
const (
	StatusNil           ProposalStatus = ProposalStatus_PROPOSAL_STATUS_UNSPECIFIED
	StatusDepositPeriod ProposalStatus = ProposalStatus_PROPOSAL_STATUS_DEPOSIT_PERIOD
	StatusVotingPeriod  ProposalStatus = ProposalStatus_PROPOSAL_STATUS_VOTING_PERIOD
	StatusPassed        ProposalStatus = ProposalStatus_PROPOSAL_STATUS_PASSED
	StatusRejected      ProposalStatus = ProposalStatus_PROPOSAL_STATUS_REJECTED
	StatusFailed        ProposalStatus = ProposalStatus_PROPOSAL_STATUS_FAILED
)

// Vote option constants
const (
	OptionYes        VoteOption = VoteOption_VOTE_OPTION_YES
	OptionNo         VoteOption = VoteOption_VOTE_OPTION_NO
	OptionNoWithVeto VoteOption = VoteOption_VOTE_OPTION_NO_WITH_VETO
	OptionAbstain    VoteOption = VoteOption_VOTE_OPTION_ABSTAIN
)

// Error types for compatibility
var (
	ErrInvalidProposal  = errorsmod.Register(ModuleName, 1, "invalid proposal")
	ErrInvalidAuthority = errorsmod.Register(ModuleName, 3, "invalid authority")
)

// NewDeposit constructs a new Deposit.
func NewDeposit(proposalID uint64, depositor string, amount sdk.Coins) Deposit {
	return Deposit{
		ProposalId: proposalID,
		Depositor:  depositor,
		Amount:     amount,
	}
}

// NewVote constructs a new Vote.
func NewVote(proposalID uint64, voter string, options []WeightedVoteOption, metadata string) Vote {
	return Vote{
		ProposalId: proposalID,
		Voter:      voter,
		Options:    options,
		Metadata:   metadata,
	}
}

// EmptyTally returns an empty TallyResult.
func EmptyTally() TallyResult {
	return TallyResult{
		YesCount:        math.ZeroInt(),
		NoCount:         math.ZeroInt(),
		NoWithVetoCount: math.ZeroInt(),
		AbstainCount:    math.ZeroInt(),
	}
}

// ErrVotingPeriodEnded is returned when voting period has ended
var ErrVotingPeriodEnded = errorsmod.Register(ModuleName, 2, "voting period ended")

// MaxDepositPeriod compatibility (reference params for duration checks)
func (p Params) GetMaxDepositPeriod() time.Duration {
	return p.VotingPeriod // use voting_period as placeholder for max_deposit_period compatibility
}
