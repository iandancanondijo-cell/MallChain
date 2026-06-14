package types

import (
	"cosmossdk.io/errors"
)

var (
	ErrInvalidRequest  = errors.Register(ModuleName, 1, "invalid request")
	ErrCodeNotFound    = errors.Register(ModuleName, 2, "code not found")
	ErrContractFailed  = errors.Register(ModuleName, 3, "contract execution failed")
	ErrUnauthorized    = errors.Register(ModuleName, 4, "unauthorized")
	ErrGasLimitExceeded = errors.Register(ModuleName, 5, "gas limit exceeded")
)