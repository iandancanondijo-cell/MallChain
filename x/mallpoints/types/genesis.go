package types

import "fmt"

// DefaultGenesis returns the default genesis state
func DefaultGenesis() *GenesisState {
	return &GenesisState{
		Params:        DefaultParams(),
		UserPointsMap: []UserPoints{},
		ConversionWindow: &ConversionWindow{
			IsOpen:       true, // Open for testing
			CurrentMonth: 1,
			NextOpening:  0,
		},
	}
}

// Validate performs basic genesis state validation returning an error upon any
// failure.
func (gs GenesisState) Validate() error {
	userPointsIndexMap := make(map[string]struct{})

	for _, elem := range gs.UserPointsMap {
		index := fmt.Sprint(elem.Index)
		if _, ok := userPointsIndexMap[index]; ok {
			return fmt.Errorf("duplicated index for userPoints")
		}
		userPointsIndexMap[index] = struct{}{}
	}

	return gs.Params.Validate()
}
