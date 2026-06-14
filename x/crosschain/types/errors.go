package types

import (
	"cosmossdk.io/errors"
)

// x/crosschain module sentinel errors
var (
	ErrInvalidTransfer           = errors.Register(ModuleName, 1100, "invalid bridge transfer")
	ErrTransferNotFound          = errors.Register(ModuleName, 1101, "bridge transfer not found")
	ErrUnauthorized              = errors.Register(ModuleName, 1102, "unauthorized")
	ErrInvalidChain              = errors.Register(ModuleName, 1103, "invalid destination chain")
	ErrTransferTimeout           = errors.Register(ModuleName, 1104, "transfer timeout")
	ErrInvalidAmount             = errors.Register(ModuleName, 1105, "invalid transfer amount")
	ErrTransferAlreadyCompleted  = errors.Register(ModuleName, 1106, "transfer already completed")
	ErrInvalidProof              = errors.Register(ModuleName, 1107, "invalid transfer proof")
	ErrInsufficientModuleBalance = errors.Register(ModuleName, 1108, "insufficient module balance to complete transfer")
)
