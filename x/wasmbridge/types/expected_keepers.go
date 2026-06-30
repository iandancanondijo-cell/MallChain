package types

import (
	"context"
)

// MlcoinKeeper defines the expected interface for the mlcoin module.
type MlcoinKeeper interface {
	Transfer(ctx context.Context, from, to string, amount uint64) error
	Approve(ctx context.Context, owner, spender string, amount uint64) error
	TransferFrom(ctx context.Context, owner, spender, recipient string, amount uint64) error
	GetAllowance(ctx context.Context, owner, spender string) (uint64, error)
}

// WalletBalanceAccessor defines the subset of wallet balance operations needed by wasmbridge.
type WalletBalanceAccessor interface {
	WalletBalance(ctx context.Context, address string) uint64
}
