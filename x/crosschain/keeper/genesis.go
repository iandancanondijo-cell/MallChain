package keeper

import (
	"context"

	"marketplace/x/crosschain/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	if err := k.Params.Set(ctx, genState.Params); err != nil {
		return err
	}

	if err := k.BridgeState.Set(ctx, genState.BridgeState); err != nil {
		return err
	}

	return nil
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}

	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		return nil, err
	}

	return &types.GenesisState{
		Params:      params,
		BridgeState: bridgeState,
	}, nil
}