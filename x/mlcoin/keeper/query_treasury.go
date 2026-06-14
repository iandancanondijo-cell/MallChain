package keeper

import (
	context "context"

	"marketplace/x/mlcoin/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k Keeper) TreasuryMetrics(
	goCtx context.Context,
	req *types.QueryTreasuryRequest,
) (*types.QueryTreasuryResponse, error) {

	ctx := sdk.UnwrapSDKContext(goCtx)

	return &types.QueryTreasuryResponse{
		TotalSupply:       k.GetTotalSupply(ctx),
		CirculatingSupply: k.GetCirculatingSupply(ctx),
		BurnedSupply:      k.GetBurnedSupply(ctx),
		TotalStaked:       k.GetTotalStaked(ctx),
		TreasuryBalance:   k.GetTreasuryBalance(ctx),
	}, nil
}

func (k Keeper) TreasuryHistory(
	goCtx context.Context,
	req *types.QueryTreasuryHistoryRequest,
) (*types.QueryTreasuryHistoryResponse, error) {

	ctx := sdk.UnwrapSDKContext(goCtx)

	snapshots := k.GetTreasurySnapshots(ctx, req.Limit)

	// Convert value snapshots to pointers for response
	var pointers []*types.TreasurySnapshot
	for i := range snapshots {
		pointers = append(pointers, &snapshots[i])
	}

	return &types.QueryTreasuryHistoryResponse{
		Snapshots: pointers,
	}, nil
}

// Helper query methods (return values or zeroes)
func (k Keeper) GetTotalSupply(ctx context.Context) uint64 {
	emission, _ := k.EmissionState.Get(ctx)
	return emission.TotalSupply
}

func (k Keeper) GetCirculatingSupply(ctx context.Context) uint64 {
	emission, _ := k.EmissionState.Get(ctx)
	return emission.Circulating
}

func (k Keeper) GetBurnedSupply(ctx context.Context) uint64 {
	// Placeholder: calculate from total - circulating if needed
	return 0
}

func (k Keeper) GetTotalStaked(ctx context.Context) uint64 {
	// Placeholder: return 0 or integrate with staking module
	return 0
}

func (k Keeper) GetTreasuryBalance(ctx context.Context) uint64 {
	// Placeholder: query bank module for module account balance
	return 0
}

// GetTreasurySnapshots returns treasury history snapshots.
func (k Keeper) GetTreasurySnapshots(ctx context.Context, limit uint64) []types.TreasurySnapshot {
	// Return empty snapshots for now; can be extended to read from collections
	return []types.TreasurySnapshot{}
}
