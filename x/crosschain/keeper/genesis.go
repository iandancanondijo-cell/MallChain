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

	for _, entry := range genState.BridgeTransfers {
		if err := k.BridgeTransfers.Set(ctx, entry.Id, entry.Transfer); err != nil {
			return err
		}
	}

	for _, entry := range genState.ChainRoutes {
		route := types.ChainRoute{
			ChainID:   entry.ChainId,
			ChannelID: entry.ChannelId,
			PortID:    entry.PortId,
		}
		if err := k.ChainRoutes.Set(ctx, entry.Key, route); err != nil {
			return err
		}
	}

	for _, entry := range genState.TransferMeta {
		meta := types.TransferMeta{
			InitHeight:       entry.InitHeight,
			IBCSequence:      entry.IbcSequence,
			TimeoutBlocks:    entry.TimeoutBlocks,
			TimeoutTimestamp: entry.TimeoutTimestamp,
			PortID:           entry.PortId,
			ChannelID:        entry.ChannelId,
		}
		if err := k.TransferMeta.Set(ctx, entry.Id, meta); err != nil {
			return err
		}
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

	var transferEntries []types.BridgeTransferEntry
	if err := k.BridgeTransfers.Walk(ctx, nil, func(key uint64, val types.BridgeTransfer) (bool, error) {
		transferEntries = append(transferEntries, types.BridgeTransferEntry{
			Id:       key,
			Transfer: val,
		})
		return false, nil
	}); err != nil {
		return nil, err
	}

	var routeEntries []types.ChainRouteEntry
	if err := k.ChainRoutes.Walk(ctx, nil, func(key string, val types.ChainRoute) (bool, error) {
		routeEntries = append(routeEntries, types.ChainRouteEntry{
			Key:       key,
			ChainId:   val.ChainID,
			ChannelId: val.ChannelID,
			PortId:    val.PortID,
		})
		return false, nil
	}); err != nil {
		return nil, err
	}

	var metaEntries []types.TransferMetaEntry
	if err := k.TransferMeta.Walk(ctx, nil, func(key uint64, val types.TransferMeta) (bool, error) {
		metaEntries = append(metaEntries, types.TransferMetaEntry{
			Id:               key,
			InitHeight:       val.InitHeight,
			IbcSequence:      val.IBCSequence,
			TimeoutBlocks:    val.TimeoutBlocks,
			TimeoutTimestamp: val.TimeoutTimestamp,
			PortId:           val.PortID,
			ChannelId:        val.ChannelID,
		})
		return false, nil
	}); err != nil {
		return nil, err
	}

	return &types.GenesisState{
		Params:          params,
		BridgeState:     bridgeState,
		BridgeTransfers: transferEntries,
		ChainRoutes:     routeEntries,
		TransferMeta:    metaEntries,
	}, nil
}