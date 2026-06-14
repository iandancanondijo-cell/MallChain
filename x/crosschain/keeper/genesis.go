package keeper

import (
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/crosschain/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx sdk.Context, genState types.GenesisState) {
	if err := k.Params.Set(ctx, genState.Params); err != nil {
		panic(err)
	}

	if err := k.BridgeState.Set(ctx, genState.BridgeState); err != nil {
		panic(err)
	}
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx sdk.Context) *types.GenesisState {
	params, err := k.Params.Get(ctx)
	if err != nil {
		panic(err)
	}

	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		panic(err)
	}

	return &types.GenesisState{
		Params:      params,
		BridgeState: bridgeState,
	}
}