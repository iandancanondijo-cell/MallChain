package types

import "fmt"

func DefaultGenesisState() *GenesisState {
	params := DefaultParams()
	return &GenesisState{
		Params:     &params,
		Pools:      []*Pool{},
		NextPoolId: 1,
	}
}

func DefaultParams() Params {
	return Params{
		DefaultFee:         "0.003",
		MinLiquidity:       1000,
		MaxFee:             "0.01",
		MinFee:             "0.001",
		MaxPoolDrainPercent: 20,
	}
}

func (gs *GenesisState) Validate() error {
	if gs == nil {
		return nil
	}
	if gs.Params != nil {
		if err := gs.Params.Validate(); err != nil {
			return err
		}
	}

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

func (p *Params) Validate() error {
	if p == nil {
		return nil
	}
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
	if p.MaxPoolDrainPercent > 30 {
		return fmt.Errorf("max pool drain percent cannot exceed 30 percent for security")
	}
	return nil
}