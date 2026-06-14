package types

import (
	errorsmod "cosmossdk.io/errors"
)

var (
	ErrInvalidAddress      = errorsmod.Register(ModuleName, 1, "invalid address")
	ErrInvalidAmount       = errorsmod.Register(ModuleName, 2, "invalid amount")
	ErrInsufficientAllowance = errorsmod.Register(ModuleName, 3, "insufficient allowance")
	ErrWalletNotFound      = errorsmod.Register(ModuleName, 4, "wallet not found")
	ErrInvalidRequest      = errorsmod.Register(ModuleName, 5, "invalid request")
)