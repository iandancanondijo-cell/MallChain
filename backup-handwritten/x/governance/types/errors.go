package types

import "cosmossdk.io/errors"

const (
	ModuleName = "governance"

	CodeTypeInvalidProposal  = uint32(1)
	CodeTypeInvalidAuthority = uint32(2)
	CodeTypeInvalidVote      = uint32(4)
	CodeTypeInvalidDepositor = uint32(5)
	CodeTypeInvalidProposer  = uint32(6)
	CodeTypeInvalidVoter     = uint32(7)
	CodeTypeInvalidDeposit   = uint32(8)
)

var (
	ErrInvalidProposal  = errors.Register(ModuleName, CodeTypeInvalidProposal, "invalid proposal")
	ErrInvalidAuthority = errors.Register(ModuleName, CodeTypeInvalidAuthority, "invalid authority")
	ErrInvalidVote      = errors.Register(ModuleName, CodeTypeInvalidVote, "invalid vote")
	ErrInvalidDepositor = errors.Register(ModuleName, CodeTypeInvalidDepositor, "invalid depositor")
	ErrInvalidProposer  = errors.Register(ModuleName, CodeTypeInvalidProposer, "invalid proposer")
	ErrInvalidVoter     = errors.Register(ModuleName, CodeTypeInvalidVoter, "invalid voter")
	ErrInvalidDeposit   = errors.Register(ModuleName, CodeTypeInvalidDeposit, "invalid deposit")
)
