package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/edu module sentinel errors
var (
	ErrInvalidSigner        = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrInvalidDocument      = errors.Register(ModuleName, 1101, "invalid document registration")
	ErrParentRecordNotFound = errors.Register(ModuleName, 1102, "parent record not found")
)
