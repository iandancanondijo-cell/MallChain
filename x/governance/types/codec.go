package types

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the codec for the governance module.
func RegisterCodec(registry interface{}) {
	// Stub: proto codec auto-registration
}

// DefaultGenesisState returns the default genesis state for the governance module.
func DefaultGenesisState() *GenesisState {
	return &GenesisState{
		Params: Params{
			MinDeposit:   sdk.Coins{},
			VotingPeriod: 0,
		},
		Proposals: []Proposal{},
		Deposits:  []Deposit{},
		Votes:     []Vote{},
	}
}

// ValidateGenesis validates the genesis state for the governance module.
func ValidateGenesis(data GenesisState) error {
	// Stub: genesis validation
	return nil
}
