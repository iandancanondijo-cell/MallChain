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
		}}

	f := initFixture(t)
	err := f.keeper.InitGenesis(f.ctx, genesisState)
	require.NoError(t, err)
	got, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, got)

	require.EqualExportedValues(t, genesisState.Params, got.Params)
	require.EqualExportedValues(t, genesisState.WalletBalanceMap, got.WalletBalanceMap)
	require.EqualExportedValues(t, genesisState.EmissionState, got.EmissionState)

}
