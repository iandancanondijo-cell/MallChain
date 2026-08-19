package keeper

import (
	context "context"

	"marketplace/x/mlcoin/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
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
	emission, _ := k.EmissionState.Get(ctx)
	return emission.BurnedTotal
}

// GetTotalStaked sums StakedAmount across every currently-active stake
// (matches mlcoin's own off-chain-style staking system in staking.go, not
// Cosmos x/staking bonding — unstaked records are kept with IsActive=false
// rather than deleted, so they must be excluded here).
func (k Keeper) GetTotalStaked(ctx context.Context) uint64 {
	var total uint64
	iter, err := k.StakingRecords.Iterate(ctx, nil)
	if err != nil {
		return 0
	}
	defer iter.Close()
	for ; iter.Valid(); iter.Next() {
		record, err := iter.Value()
		if err != nil {
			continue
		}
		if record.IsActive {
			total += record.StakedAmount
		}
	}
	return total
}

// GetTreasuryBalance queries the real on-chain balance of the treasury
// module account (the same address DistributeFees pays the treasury's fee
// share into — see end_blocker.go's authtypes.NewModuleAddress("treasury")).
func (k Keeper) GetTreasuryBalance(ctx context.Context) uint64 {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	treasuryAddr := authtypes.NewModuleAddress("treasury")
	balance := k.bankKeeper.GetBalance(sdkCtx, treasuryAddr, "mlcoin")
	return balance.Amount.Uint64()
}

// GetTreasurySnapshots returns up to `limit` treasury history snapshots
// (written daily by RecordTreasurySnapshot in end_blocker.go), most recent
// first. limit==0 means "no cap".
func (k Keeper) GetTreasurySnapshots(ctx context.Context, limit uint64) []types.TreasurySnapshot {
	var snapshots []types.TreasurySnapshot
	_ = k.TreasurySnapshots.Walk(ctx, nil, func(_ int64, snapshot types.TreasurySnapshot) (bool, error) {
		snapshots = append(snapshots, snapshot)
		return false, nil
	})

	// Walk visits ascending by height (Int64Key preserves numeric order) —
	// reverse in place so the response is newest-first.
	for i, j := 0, len(snapshots)-1; i < j; i, j = i+1, j-1 {
		snapshots[i], snapshots[j] = snapshots[j], snapshots[i]
	}

	if limit > 0 && uint64(len(snapshots)) > limit {
		snapshots = snapshots[:limit]
	}
	return snapshots
}
