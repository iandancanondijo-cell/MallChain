package keeper

import (
	"context"

	"marketplace/x/dex/types"
)

// InitGenesis initializes the dex module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	// Set module parameters
	if genState.Params != nil {
		if err := k.SetParams(ctx, *genState.Params); err != nil {
			return err
		}
	}

	// Set next pool ID
	if err := k.SetNextPoolId(ctx, genState.NextPoolId); err != nil {
		return err
	}

	// Initialize pools
	for _, pool := range genState.Pools {
		if pool == nil {
			continue
		}
		if err := k.pools.Set(ctx, pool.Id, *pool); err != nil {
			return err
		}
	}

	return nil
}

// ExportGenesis returns the dex module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	// Get module parameters
	params, err := k.GetParams(ctx)
	if err != nil {
		return nil, err
	}

	// Get next pool ID
	nextPoolId, err := k.GetNextPoolId(ctx)
	if err != nil {
		return nil, err
	}

	// Get all pools
	pools, err := k.GetAllPools(ctx)
	if err != nil {
		return nil, err
	}

	poolPointers := make([]*types.Pool, len(pools))
	for i := range pools {
		poolPointers[i] = &pools[i]
	}

	return &types.GenesisState{
		Params:     &params,
		Pools:      poolPointers,
		NextPoolId: nextPoolId,
	}, nil
}
