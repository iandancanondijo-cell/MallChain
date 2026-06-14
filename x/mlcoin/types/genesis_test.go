package types_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"marketplace/x/mlcoin/types"
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
			genState: &types.GenesisState{WalletBalanceMap: []types.WalletBalance{{Index: "0"}, {Index: "1"}}, EmissionState: &types.EmissionState{TotalSupply: 3,
				Circulating:  41,
				MonthlyCap:   100,
				DailyLimit:   18,
				CurrentMonth: 1,
				CurrentDay:   85,
			}},
			valid: true,
		}, {
			desc: "duplicated walletBalance",
			genState: &types.GenesisState{
				WalletBalanceMap: []types.WalletBalance{
					{
						Index: "0",
					},
					{
						Index: "0",
					},
				},
				EmissionState: &types.EmissionState{TotalSupply: 3,
					Circulating:  41,
					MonthlyCap:   100,
					DailyLimit:   18,
					CurrentMonth: 1,
					CurrentDay:   85,
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
