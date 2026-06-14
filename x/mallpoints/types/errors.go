package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/mallpoints module sentinel errors
var (
	ErrInvalidSigner          = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrUserNotFound           = errors.Register(ModuleName, 1101, "user not found")
	ErrInsufficientPoints     = errors.Register(ModuleName, 1102, "insufficient Mallpoints balance")
	ErrConversionWindowClosed = errors.Register(ModuleName, 1103, "conversion window is closed")
	ErrBadgeRequired          = errors.Register(ModuleName, 1104, "badge required for conversion")
	ErrNoBadge                = errors.Register(ModuleName, 1105, "user does not have a badge")
	ErrInvalidRequest         = errors.Register(ModuleName, 1106, "invalid request")
	ErrMonthlyCapExceeded     = errors.Register(ModuleName, 1107, "monthly issuance cap exceeded")
)
