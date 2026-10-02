package keeper

import (
	"context"

	"cosmossdk.io/collections"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/dex/types"
)

// InitGenesis initializes the dex module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState *types.GenesisState) error {
	if genState.Params != nil {
		if err := k.SetParams(ctx, genState.Params); err != nil {
			return err
		}
	}

	if err := k.SetNextPoolId(ctx, genState.NextPoolId); err != nil {
		return err
	}

	for _, pool := range genState.Pools {
		if pool == nil {
			continue
		}
		if err := k.pools.Set(ctx, pool.Id, pool); err != nil {
			return err
		}
	}

	for _, entry := range genState.PoolLiquidity {
		if entry == nil {
			continue
		}
		addrBytes, err := sdk.AccAddressFromBech32(entry.Address)
		if err != nil {
			return err
		}
		key := collections.Join(entry.PoolId, addrBytes.Bytes())
		if err := k.poolLiquidity.Set(ctx, key, *entry.Liquidity); err != nil {
			return err
		}
	}

	return nil
}

// ExportGenesis returns the dex module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	params, err := k.GetParams(ctx)
	if err != nil {
		return nil, err
	}

	nextPoolId, err := k.GetNextPoolId(ctx)
	if err != nil {
		return nil, err
	}

	pools, err := k.GetAllPools(ctx)
	if err != nil {
		return nil, err
	}

	var lpEntries []*types.PoolLiquidityEntry
	err = k.poolLiquidity.Walk(ctx, nil, func(key collections.Pair[uint64, []byte], val sdk.Coin) (bool, error) {
		addrStr := sdk.AccAddress(key.K2()).String()
		lpEntries = append(lpEntries, &types.PoolLiquidityEntry{
			PoolId:    key.K1(),
			Address:   addrStr,
			Liquidity: &val,
		})
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	return &types.GenesisState{
		Params:        params,
		Pools:         pools,
		NextPoolId:    nextPoolId,
		PoolLiquidity: lpEntries,
	}, nil
}
