package types

import "fmt"

// DefaultGenesisState returns the default genesis state
func DefaultGenesisState() *GenesisState {
	params := DefaultParams()
	return &GenesisState{
		Params:     &params,
		Pools:      []*Pool{},
		NextPoolId: 1,
	}
}

// DefaultParams returns the default parameters for the dex module
func DefaultParams() Params {
	return Params{
		DefaultFee:          "0.003", // 0.3%
		MinLiquidity:        1000,
		MaxFee:              "0.01",  // 1%
		MinFee:              "0.001", // 0.1%
		MaxPoolDrainPercent: 30,      // 30% max drain per transaction
	}
}

// Validate validates the genesis state
func (gs GenesisState) Validate() error {
	if gs.Params != nil {
		if err := gs.Params.Validate(); err != nil {
			return err
		}
	}

	// Validate pools
	poolIds := make(map[uint64]bool)
	for _, pool := range gs.Pools {
		if pool == nil {
			continue
		}
		if poolIds[pool.Id] {
			return fmt.Errorf("duplicate pool id %d", pool.Id)
		}
		poolIds[pool.Id] = true

		if pool.Id == 0 {
			return fmt.Errorf("pool id cannot be zero")
		}
		if pool.TokenADenom == "" || pool.TokenBDenom == "" {
			return fmt.Errorf("pool token denoms cannot be empty")
		}
		if pool.TokenADenom == pool.TokenBDenom {
			return fmt.Errorf("pool token denoms must be different")
		}
		if !pool.TokenAReserve.IsValid() || !pool.TokenBReserve.IsValid() {
			return fmt.Errorf("invalid pool reserves")
		}
		if !pool.TotalLiquidity.IsValid() {
			return fmt.Errorf("invalid total liquidity")
		}
	}

	if gs.NextPoolId == 0 {
		return fmt.Errorf("next pool id cannot be zero")
	}

	return nil
}

// Validate validates the parameters
func (p Params) Validate() error {
	if p.DefaultFee == "" {
		return fmt.Errorf("default fee cannot be empty")
	}
	if p.MinLiquidity == 0 {
		return fmt.Errorf("min liquidity cannot be zero")
	}
	if p.MaxFee == "" {
		return fmt.Errorf("max fee cannot be empty")
	}
	if p.MinFee == "" {
		return fmt.Errorf("min fee cannot be empty")
	}
	if p.MaxPoolDrainPercent == 0 {
		return fmt.Errorf("max pool drain percent cannot be zero")
	}
	if p.MaxPoolDrainPercent > 50 {
		return fmt.Errorf("max pool drain percent cannot exceed 50%")
	}
	return nil
}
