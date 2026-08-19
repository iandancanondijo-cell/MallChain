package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/types"
)

// Regression coverage: TreasuryMetrics used to return hardcoded zeros for
// BurnedSupply and TotalStaked regardless of actual chain state (see
// query_treasury.go) — a real admin/treasury dashboard endpoint silently
// lying about the numbers it displays.
func TestGetBurnedSupplyReadsEmissionState(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.EmissionState.Set(f.ctx, types.EmissionState{
		TotalSupply: 670_000_000,
		Circulating: 500_000_000,
		BurnedTotal: 1_234_567,
	}))

	require.Equal(t, uint64(1_234_567), f.keeper.GetBurnedSupply(f.ctx))
}

func TestGetTotalStakedSumsOnlyActiveStakes(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.StakingRecords.Set(f.ctx, "stake-1", types.StakingInfo{
		Address: "addr1", StakedAmount: 1000, IsActive: true,
	}))
	require.NoError(t, f.keeper.StakingRecords.Set(f.ctx, "stake-2", types.StakingInfo{
		Address: "addr2", StakedAmount: 5000, IsActive: true,
	}))
	// Unstaked (IsActive=false) — record is kept, not deleted, and must be excluded.
	require.NoError(t, f.keeper.StakingRecords.Set(f.ctx, "stake-3", types.StakingInfo{
		Address: "addr3", StakedAmount: 9999, IsActive: false,
	}))

	require.Equal(t, uint64(6000), f.keeper.GetTotalStaked(f.ctx))
}

// Regression coverage: TreasuryHistory used to always return an empty list —
// no writer ever populated it despite the type/key existing. Confirms
// StoreTreasurySnapshot actually persists a real snapshot and
// GetTreasurySnapshots reads it back, newest-first, respecting the limit.
//
// Uses StoreTreasurySnapshot (not RecordTreasurySnapshot) because the latter
// calls GetTreasuryBalance, which needs a real bank keeper — mlcoin's
// BankKeeper is a type alias to the SDK's concrete BaseKeeper rather than an
// interface, so this lightweight fixture (which supplies a zero-value one)
// can't satisfy it without a full bank-module test setup.
func TestStoreAndGetTreasurySnapshots(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.StoreTreasurySnapshot(f.ctx, types.TreasurySnapshot{
		BlockHeight: 100, TotalSupply: 670_000_000, BurnedSupply: 1000, Timestamp: 1000,
	}))
	require.NoError(t, f.keeper.StoreTreasurySnapshot(f.ctx, types.TreasurySnapshot{
		BlockHeight: 200, TotalSupply: 670_000_000, BurnedSupply: 2000, Timestamp: 2000,
	}))
	require.NoError(t, f.keeper.StoreTreasurySnapshot(f.ctx, types.TreasurySnapshot{
		BlockHeight: 300, TotalSupply: 670_000_000, BurnedSupply: 3000, Timestamp: 3000,
	}))

	all := f.keeper.GetTreasurySnapshots(f.ctx, 0)
	require.Len(t, all, 3)
	// Newest first.
	require.Equal(t, int64(300), all[0].BlockHeight)
	require.Equal(t, int64(200), all[1].BlockHeight)
	require.Equal(t, int64(100), all[2].BlockHeight)
	require.Equal(t, uint64(3000), all[0].BurnedSupply)

	limited := f.keeper.GetTreasurySnapshots(f.ctx, 2)
	require.Len(t, limited, 2)
	require.Equal(t, int64(300), limited[0].BlockHeight)
	require.Equal(t, int64(200), limited[1].BlockHeight)
}

func TestStoreTreasurySnapshotPrunesOldEntries(t *testing.T) {
	f := initFixture(t)

	// One more than the cap.
	for h := int64(1); h <= 601; h++ {
		require.NoError(t, f.keeper.StoreTreasurySnapshot(f.ctx, types.TreasurySnapshot{BlockHeight: h}))
	}

	all := f.keeper.GetTreasurySnapshots(f.ctx, 0)
	require.Len(t, all, 600)
	// The oldest (height 1) should have been pruned.
	require.Equal(t, int64(601), all[0].BlockHeight)
	require.Equal(t, int64(2), all[len(all)-1].BlockHeight)
}
