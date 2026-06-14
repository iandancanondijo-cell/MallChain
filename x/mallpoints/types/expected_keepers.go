package types

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
)

// AuthKeeper is the concrete auth keeper type from the SDK used for wiring.
type AuthKeeper = authkeeper.AccountKeeper

// BankKeeper defines the expected interface for the Bank module.
type BankKeeper interface {
	SpendableCoins(context.Context, sdk.AccAddress) sdk.Coins
	// Methods imported from bank should be defined here
}

// ParamSubspace defines the expected Subspace interface for parameters.
type ParamSubspace interface {
	Get(context.Context, []byte, interface{})
	Set(context.Context, []byte, interface{})
}

// BadgeKeeper defines the expected interface for the Badge module.
type BadgeKeeper interface {
	HasUserBadge(ctx context.Context, address string) bool
}

// MlcoinKeeper defines the expected interface for the Mlcoin module.
type MlcoinKeeper interface {
	MintToWallet(ctx context.Context, address string, amount uint64) error
	WithMintingEnabled(ctx context.Context, fn func() error) error
}
