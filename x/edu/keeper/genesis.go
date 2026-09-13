package keeper

import (
	"context"

	"cosmossdk.io/collections"

	"marketplace/x/edu/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	for _, elem := range genState.DocumentRecordMap {
		if err := k.DocumentRecord.Set(ctx, elem.RecordId, elem); err != nil {
			return err
		}
		if err := k.DocVersionIndex.Set(ctx, collections.Join(elem.DocId, elem.Version), elem.RecordId); err != nil {
			return err
		}
	}

	return k.Params.Set(ctx, genState.Params)
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	var err error

	genesis := types.DefaultGenesis()
	genesis.Params, err = k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}
	if err := k.DocumentRecord.Walk(ctx, nil, func(_ string, val types.DocumentRecord) (stop bool, err error) {
		genesis.DocumentRecordMap = append(genesis.DocumentRecordMap, val)
		return false, nil
	}); err != nil {
		return nil, err
	}

	return genesis, nil
}
