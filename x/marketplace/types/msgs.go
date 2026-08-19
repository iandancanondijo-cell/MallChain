package types

// GenesisState defines the marketplace module's genesis state. It is plain
// JSON (not a proto message) since it's only read once at chain init, not
// part of the consensus wire format.
type GenesisState struct {
	Escrows []Escrow `json:"escrows,omitempty"`
}

func DefaultGenesis() GenesisState {
	return GenesisState{}
}

func (gs GenesisState) Validate() error {
	return nil
}
