package types

import (
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// DefaultBurnWallet represents the BurnWallet default value.
// Empty string means no burn wallet configured.
var DefaultBurnWallet string = ""

// NewParams creates a new Params instance.
func NewParams(
	burnWallet string,
) Params {
	return Params{
		BurnWallet: burnWallet,
	}
}

// DefaultParams returns a default set of parameters.
func DefaultParams() Params {
	return NewParams(
		DefaultBurnWallet,
	)
}

// Validate validates the set of params.
func (p Params) Validate() error {
	if err := validateBurnWallet(p.BurnWallet); err != nil {
		return err
	}

	return nil
}

// validateBurnWallet validates the BurnWallet parameter.
// Empty value is allowed. If non-empty, it must be a valid bech32 account address.
func validateBurnWallet(v string) error {
	if v == "" {
		return nil
	}

	if _, err := sdk.AccAddressFromBech32(v); err != nil {
		return fmt.Errorf("invalid burn wallet address: %w", err)
	}

	return nil
}
