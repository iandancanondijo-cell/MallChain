package types

type GenesisState struct{}

func (GenesisState) Reset()         {}
func (GenesisState) String() string { return "GenesisState{}" }
func (GenesisState) ProtoMessage()  {}

func (GenesisState) Validate() error { return nil }

func DefaultGenesis() GenesisState {
	return GenesisState{}
}