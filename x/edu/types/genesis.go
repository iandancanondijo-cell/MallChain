package types

import "fmt"

// DefaultGenesis returns the default genesis state
func DefaultGenesis() *GenesisState {
	return &GenesisState{
		Params:            DefaultParams(),
		DocumentRecordMap: []DocumentRecord{},
	}
}

// Validate performs basic genesis state validation returning an error upon any
// failure.
func (gs GenesisState) Validate() error {
	recordIDMap := make(map[string]struct{})

	for _, elem := range gs.DocumentRecordMap {
		if _, ok := recordIDMap[elem.RecordId]; ok {
			return fmt.Errorf("duplicated record_id for documentRecord")
		}
		recordIDMap[elem.RecordId] = struct{}{}
	}

	return gs.Params.Validate()
}
