package keeper_test

import (
	"testing"

	"marketplace/x/mallpoints/types"

	"github.com/stretchr/testify/require"
)

func TestGenesis(t *testing.T) {
	genesisState := types.GenesisState{
		Params:        types.DefaultParams(),
		UserPointsMap: []types.UserPoints{{Index: "0"}, {Index: "1"}}, ConversionWindow: &types.ConversionWindow{IsOpen: false,
			CurrentMonth: 87,
			NextOpening:  49,
		}}

	f := initFixture(t)
	err := f.keeper.InitGenesis(f.ctx, genesisState)
	require.NoError(t, err)
	got, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, got)

	require.EqualExportedValues(t, genesisState.Params, got.Params)
	require.EqualExportedValues(t, genesisState.UserPointsMap, got.UserPointsMap)
	require.EqualExportedValues(t, genesisState.ConversionWindow, got.ConversionWindow)

}
