package types

import "fmt"

// DefaultGenesis returns the default genesis state
func DefaultGenesis() *GenesisState {
	return &GenesisState{
		Params:       DefaultParams(),
		UserBadgeMap: []UserBadge{}}
}

// Validate performs basic genesis state validation returning an error upon any
// failure.
func (gs GenesisState) Validate() error {
	userBadgeIndexMap := make(map[string]struct{})

	for _, elem := range gs.UserBadgeMap {
		index := fmt.Sprint(elem.Index)
		if _, ok := userBadgeIndexMap[index]; ok {
			return fmt.Errorf("duplicated index for userBadge")
		}
		userBadgeIndexMap[index] = struct{}{}
	}

	return gs.Params.Validate()
}
