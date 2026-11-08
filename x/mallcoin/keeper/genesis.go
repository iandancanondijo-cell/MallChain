package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"

	"marketplace/x/mallcoin/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	return k.Params.Set(ctx, genState.Params)
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	var err error

	genesis := types.DefaultGenesis()
	genesis.Params, err = k.Params.Get(ctx)
	if errors.Is(err, collections.ErrNotFound) {
		// Params were never written because this module did not exist when the
		// chain's genesis was created; export must still succeed, so fall back
		// to the genesis defaults instead of failing (and panicking) the export.
		genesis.Params = types.DefaultParams()
		err = nil
	}
	if err != nil {
		return nil, err
	}

	return genesis, nil
}
