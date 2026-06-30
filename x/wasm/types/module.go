package types

import (
	"encoding/json"
)

// GenesisState defines the wasm module genesis state
type GenesisState struct {
	Params json.RawMessage `json:"params,omitempty"`
	CodeEntries []CodeEntry `json:"code_entries,omitempty"`
	ContractEntries []ContractEntry `json:"contract_entries,omitempty"`
}

type CodeEntry struct {
	CodeID uint64 `json:"code_id"`
	WasmCode []byte `json:"wasm_code"`
}

type ContractEntry struct {
	ContractAddr string `json:"contract_addr"`
	Metadata json.RawMessage `json:"metadata"`
	StateEntries []StateEntry `json:"state_entries,omitempty"`
}

type StateEntry struct {
	ContractAddr string `json:"contract_addr"`
	Key string `json:"key"`
	Value []byte `json:"value"`
}

func (GenesisState) Reset()         {}
func (GenesisState) String() string { return "GenesisState{}" }
func (GenesisState) ProtoMessage()  {}

func DefaultGenesis() GenesisState {
	return GenesisState{}
}

func (gs GenesisState) Validate() error {
	return nil
}
