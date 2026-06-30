package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"marketplace/x/mallpoints/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	for _, elem := range genState.UserPointsMap {
		if err := k.UserPoints.Set(ctx, elem.Index, elem); err != nil {
			return err
		}
	}
	if genState.ConversionWindow != nil {
		if err := k.ConversionWindow.Set(ctx, *genState.ConversionWindow); err != nil {
			return err
		}
	}

	if err := k.Params.Set(ctx, genState.Params); err != nil {
		return err
	}
	return k.initIntervals(ctx)
}

func (k Keeper) initIntervals(ctx context.Context) error {
	if _, err := k.Intervals.Get(ctx); err == nil {
		return nil
	}
	return k.Intervals.Set(ctx, types.DefaultModuleIntervals())
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	var err error

	genesis := types.DefaultGenesis()
	genesis.Params, err = k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}
	if err := k.UserPoints.Walk(ctx, nil, func(_ string, val types.UserPoints) (stop bool, err error) {
		genesis.UserPointsMap = append(genesis.UserPointsMap, val)
		return false, nil
	}); err != nil {
		return nil, err
	}
	conversionWindow, err := k.ConversionWindow.Get(ctx)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}
	genesis.ConversionWindow = &conversionWindow

	return genesis, nil
}
