package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"marketplace/x/mallpoints/types"
)

func (k Keeper) GetModuleIntervals(ctx context.Context) (types.ModuleIntervals, error) {
	intervals, err := k.Intervals.Get(ctx)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return types.DefaultModuleIntervals(), nil
		}
		return types.ModuleIntervals{}, err
	}
	return intervals, nil
}

func (k Keeper) SetModuleIntervals(ctx context.Context, intervals types.ModuleIntervals) error {
	return k.Intervals.Set(ctx, intervals)
}
