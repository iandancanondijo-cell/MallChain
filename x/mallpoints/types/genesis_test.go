package types_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"marketplace/x/mallpoints/types"
)

func TestGenesisState_Validate(t *testing.T) {
	tests := []struct {
		desc     string
		genState *types.GenesisState
		valid    bool
	}{
		{
			desc:     "default is valid",
			genState: types.DefaultGenesis(),
			valid:    true,
		},
		{
			desc: "valid genesis state",
			genState: &types.GenesisState{UserPointsMap: []types.UserPoints{{Index: "0"}, {Index: "1"}}, ConversionWindow: &types.ConversionWindow{IsOpen: false,
				CurrentMonth: 92,
				NextOpening:  22,
			}},
			valid: true,
		}, {
			desc: "duplicated userPoints",
			genState: &types.GenesisState{
				UserPointsMap: []types.UserPoints{
					{
						Index: "0",
					},
					{
						Index: "0",
					},
				},
				ConversionWindow: &types.ConversionWindow{IsOpen: false,
					CurrentMonth: 92,
					NextOpening:  22,
				}},
			valid: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			err := tc.genState.Validate()
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
