package keeper

import (
	"context"

	"cosmossdk.io/collections"
	cosmossdkerrors "cosmossdk.io/errors"

	"marketplace/x/wasm/types"
)

func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	for _, entry := range genState.CodeEntries {
		if err := k.ContractCode.Set(ctx, entry.CodeID, entry.WasmCode); err != nil {
			return cosmossdkerrors.Wrap(err, "failed to set code")
		}
		if entry.CodeID > 0 {
			if err := k.ContractCodeID.Set(ctx, entry.CodeID); err != nil {
				return cosmossdkerrors.Wrap(err, "failed to set code id")
			}
		}
	}

	for _, entry := range genState.ContractEntries {
		if err := k.Contracts.Set(ctx, entry.ContractAddr, entry.Metadata); err != nil {
			return cosmossdkerrors.Wrap(err, "failed to set contract")
		}

		for _, se := range entry.StateEntries {
			if err := k.ContractState.Set(ctx, collections.Join(se.ContractAddr, se.Key), se.Value); err != nil {
				return cosmossdkerrors.Wrap(err, "failed to set contract state")
			}
		}
	}

	return nil
}

func (k Keeper) ExportGenesis(ctx context.Context) (types.GenesisState, error) {
	var genState types.GenesisState

	codeIter, err := k.ContractCode.Iterate(ctx, nil)
	if err != nil {
		return genState, err
	}
	defer codeIter.Close()

	for ; codeIter.Valid(); codeIter.Next() {
		codeID, _ := codeIter.Key()
		code, _ := codeIter.Value()
		genState.CodeEntries = append(genState.CodeEntries, types.CodeEntry{
			CodeID:    codeID,
			WasmCode:  code,
		})
	}

	contractIter, err := k.Contracts.Iterate(ctx, nil)
	if err != nil {
		return genState, err
	}
	defer contractIter.Close()

	for ; contractIter.Valid(); contractIter.Next() {
		addr, _ := contractIter.Key()
		metadata, _ := contractIter.Value()

		var stateEntries []types.StateEntry
		err = k.ContractState.Walk(ctx, nil, func(key collections.Pair[string, string], value []byte) (bool, error) {
			if key.K1() == addr {
				stateEntries = append(stateEntries, types.StateEntry{
					ContractAddr: addr,
					Key:          key.K2(),
					Value:        value,
				})
			}
			return false, nil
		})
		if err != nil {
			return genState, err
		}

		genState.ContractEntries = append(genState.ContractEntries, types.ContractEntry{
			ContractAddr: addr,
			Metadata:     metadata,
			StateEntries: stateEntries,
		})
	}

	return genState, nil
}
