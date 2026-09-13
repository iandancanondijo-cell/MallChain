package types

import (
	"fmt"

	"cosmossdk.io/math"
)

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

// Validate checks structural well-formedness (non-empty, in-range) AND that
// the fee fields actually parse as decimals and sit in a sane relative
// order. Previously this only checked non-empty strings — keeper.go's swap
// path calls math.LegacyMustNewDecFromStr(params.MinFee/MaxFee), which
// panics on a non-numeric string, and nothing anywhere checked
// MinFee <= DefaultFee <= MaxFee, so a governance-passed update with those
// out of order silently made every future swap either always reject (if
// DefaultFee fell below the allowed range) or accept the wrong fee.
// UpdateParams (msg_server.go) now calls this before persisting a change —
// previously it accepted anything as long as the message wasn't nil.
func (p *Params) Validate() error {
	if p == nil {
		return nil
	}
	if p.MinLiquidity == 0 {
		return fmt.Errorf("min liquidity cannot be zero")
	}
	if p.MaxPoolDrainPercent == 0 {
		return fmt.Errorf("max pool drain percent cannot be zero")
	}
	if p.MaxPoolDrainPercent > 30 {
		return fmt.Errorf("max pool drain percent cannot exceed 30 percent for security")
	}

	minFee, err := parseFeeDec("min fee", p.MinFee)
	if err != nil {
		return err
	}
	maxFee, err := parseFeeDec("max fee", p.MaxFee)
	if err != nil {
		return err
	}
	defaultFee, err := parseFeeDec("default fee", p.DefaultFee)
	if err != nil {
		return err
	}

	if minFee.IsNegative() || maxFee.IsNegative() || defaultFee.IsNegative() {
		return fmt.Errorf("fee values cannot be negative")
	}
	if minFee.GT(maxFee) {
		return fmt.Errorf("min fee %s cannot exceed max fee %s", p.MinFee, p.MaxFee)
	}
	if defaultFee.LT(minFee) || defaultFee.GT(maxFee) {
		return fmt.Errorf("default fee %s must be within [min fee %s, max fee %s]", p.DefaultFee, p.MinFee, p.MaxFee)
	}
	if maxFee.GTE(math.LegacyOneDec()) {
		return fmt.Errorf("max fee %s must be less than 1 (100%%)", p.MaxFee)
	}

	return nil
}

func parseFeeDec(label, value string) (math.LegacyDec, error) {
	if value == "" {
		return math.LegacyDec{}, fmt.Errorf("%s cannot be empty", label)
	}
	dec, err := math.LegacyNewDecFromStr(value)
	if err != nil {
		return math.LegacyDec{}, fmt.Errorf("%s %q is not a valid decimal: %w", label, value, err)
	}
	return dec, nil
}