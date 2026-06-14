package types

import "cosmossdk.io/errors"

const (
	CodeTypeInvalidVote      = uint32(4)
	CodeTypeInvalidDepositor = uint32(5)
	CodeTypeInvalidProposer  = uint32(6)
	CodeTypeInvalidVoter     = uint32(7)
	CodeTypeInvalidDeposit   = uint32(8)
)

var (
	// Note: ErrInvalidProposal and ErrInvalidAuthority are defined in compat_aliases.go
	ErrInvalidVote      = errors.Register(ModuleName, CodeTypeInvalidVote, "invalid vote")
	ErrInvalidDepositor = errors.Register(ModuleName, CodeTypeInvalidDepositor, "invalid depositor")
	ErrInvalidProposer  = errors.Register(ModuleName, CodeTypeInvalidProposer, "invalid proposer")
	ErrInvalidVoter     = errors.Register(ModuleName, CodeTypeInvalidVoter, "invalid voter")
	ErrInvalidDeposit   = errors.Register(ModuleName, CodeTypeInvalidDeposit, "invalid deposit")
)
