package keeper_test

import (
	"testing"

	"marketplace/x/mlcoin/types"

	"github.com/stretchr/testify/require"
)

func TestGenesis(t *testing.T) {
	genesisState := types.GenesisState{
		Params:           types.DefaultParams(),
		WalletBalanceMap: []types.WalletBalance{{Index: "0"}, {Index: "1"}}, EmissionState: &types.EmissionState{TotalSupply: 55,
			Circulating:  14,
			MonthlyCap:   100,
			DailyLimit:   66,
			CurrentMonth: 50,
			CurrentDay:   4,
		},
		FeesAccumulated: types.FeesAccumulated{
			TransactionFees:      100,
			TradingFees:          50,
			ConversionFees:       25,
			LastDistributionTime: 123456,
		},
	}

	f := initFixture(t)
	err := f.keeper.InitGenesis(f.ctx, genesisState)
	require.NoError(t, err)
	got, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, got)

	require.EqualExportedValues(t, genesisState.Params, got.Params)
	require.EqualExportedValues(t, genesisState.WalletBalanceMap, got.WalletBalanceMap)
	require.EqualExportedValues(t, genesisState.EmissionState, got.EmissionState)
	require.EqualExportedValues(t, genesisState.FeesAccumulated, got.FeesAccumulated)
}

// Wallets created by the keeper paths (mint / transfer / staking) are stored
// under the bech32 address and never carry Index, while InitGenesis re-inserts
// by Index. An export that left Index blank would therefore re-import every
// live wallet under the "" key, collapsing the whole wallet map on the next
// restart. Pin the backfill that keeps a live-state export re-importable.
func TestExportGenesisKeepsKeeperWalletsReimportable(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.InitGenesis(f.ctx, types.GenesisState{
		Params: types.DefaultParams(),
	}))

	const walletA = "mall1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	const walletB = "mall1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	for _, w := range []struct {
		addr    string
		balance uint64
	}{{walletA, 1_000}, {walletB, 2_500}} {
		require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, w.addr, types.WalletBalance{
			Address: w.addr,
			Balance: w.balance,
		}))
	}

	got, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.Len(t, got.WalletBalanceMap, 2)
	byIndex := map[string]types.WalletBalance{}
	for _, w := range got.WalletBalanceMap {
		byIndex[w.Index] = w
	}
	require.Equal(t, uint64(1_000), byIndex[walletA].Balance)
	require.Equal(t, uint64(2_500), byIndex[walletB].Balance)

	// Re-importing the export (what a restart from genesis.json does) must put
	// the wallets back under their own addresses, not merge them together.
	require.NoError(t, f.keeper.InitGenesis(f.ctx, *got))
	reexported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.Len(t, reexported.WalletBalanceMap, 2)

	wallet, err := f.keeper.WalletBalance.Get(f.ctx, walletB)
	require.NoError(t, err)
	require.Equal(t, uint64(2_500), wallet.Balance)
}
