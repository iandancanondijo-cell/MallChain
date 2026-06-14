package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/badge module sentinel errors
var (
	ErrInvalidSigner      = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrBadgeAlreadyIssued = errors.Register(ModuleName, 1101, "badge already issued to user")
	ErrBadgeNotFound      = errors.Register(ModuleName, 1102, "badge not found for user")
)
