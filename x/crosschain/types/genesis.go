package types

// DefaultGenesisState returns the default genesis state for the crosschain module.
func DefaultGenesisState() *GenesisState {
	return &GenesisState{
		Params: Params{},
		BridgeState: BridgeState{
			NextTransferId:   1,
			PendingTransfers: []*BridgeTransfer{},
		},
	}
}

// Validate validates the genesis state for the crosschain module.
func (g GenesisState) Validate() error {
	// Stub: genesis validation
	return nil
}
