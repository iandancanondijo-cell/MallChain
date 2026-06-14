package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "governance"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName
)

var (
	// ProposalKey is the prefix to retrieve all Proposals
	ProposalKey = collections.NewPrefix("p_proposals")

	// VoteKey is the prefix to retrieve all Votes
	VoteKey = collections.NewPrefix("p_votes")

	// DepositKey is the prefix to retrieve all Deposits
	DepositKey = collections.NewPrefix("p_deposits")

	// ParamsKey is the prefix to retrieve all Params
	ParamsKey = collections.NewPrefix("p_params")

	// ConstitutionKey is the key for the constitution
	ConstitutionKey = collections.NewPrefix("p_constitution")
)
