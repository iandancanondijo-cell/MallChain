package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/mlcoin module sentinel errors
var (
	ErrInvalidSigner         = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrWalletNotFound        = errors.Register(ModuleName, 1101, "wallet not found")
	ErrInsufficientBalance   = errors.Register(ModuleName, 1102, "insufficient balance")
	ErrEmissionCapExceeded   = errors.Register(ModuleName, 1103, "emission cap exceeded")
	ErrInvalidSupply         = errors.Register(ModuleName, 1104, "invalid supply amount")
	ErrDailyLimitExceeded    = errors.Register(ModuleName, 1105, "daily emission limit exceeded")
	ErrMonthlyCapExceeded    = errors.Register(ModuleName, 1106, "monthly emission cap exceeded")
	ErrLiquidityCapExceeded  = errors.Register(ModuleName, 1107, "buy-side KES liquidity cap exceeded")
	ErrSupplyExhausted       = errors.Register(ModuleName, 1108, "total supply exhausted")
	ErrTransactionNotFound   = errors.Register(ModuleName, 1109, "transaction not found")
	ErrInsufficientAllowance = errors.Register(ModuleName, 1110, "insufficient allowance")
	ErrInvalidRequest        = errors.Register(ModuleName, 1111, "invalid request")
	ErrUnauthorized          = errors.Register(ModuleName, 1112, "unauthorized")
	ErrInvalidSignature      = errors.Register(ModuleName, 1113, "invalid signature")
)
