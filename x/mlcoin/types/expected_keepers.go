package types

import (
	context "context"

	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
)

// AuthKeeper is the concrete auth keeper type from the SDK used for wiring.
// Using a type alias ensures depinject resolves the same concrete type used
// by the application (`app.AuthKeeper`).
type AuthKeeper = authkeeper.AccountKeeper

// BankKeeper is aliased to the SDK's BaseKeeper to ensure depinject resolves
// the exact concrete type provided by the bank module.
type BankKeeper = bankkeeper.BaseKeeper

// ParamSubspace defines the expected Subspace interface for parameters.
type ParamSubspace interface {
	Get(context.Context, []byte, interface{})
	Set(context.Context, []byte, interface{})
}
