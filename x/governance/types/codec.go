package types

// RegisterCodec registers the codec for the governance module.
func RegisterCodec(registry interface{}) {
	// Stub: proto codec auto-registration
}

// DefaultGenesisState returns the default genesis state for the governance module.
func DefaultGenesisState() *GenesisState {
	return &GenesisState{
		Params:    DefaultParams(),
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
