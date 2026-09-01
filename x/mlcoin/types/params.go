package types

import (
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// DefaultBurnWallet represents the BurnWallet default value.
// Empty string means no burn wallet configured.
var DefaultBurnWallet string = ""

// DefaultMinStakeAmount is the default minimum staked amount required before
// a MsgStake is accepted. Set equal to DefaultModuleIntervals().RewardDivisor
// (18250 base units by default) so the formula `stakedAmount / RewardDivisor`
// always produces at least 1 unit of block reward for the smallest valid stake.
const DefaultMinStakeAmount uint64 = 18_250

// DefaultMlptsPerMlcns is the default conversion ratio (fixed-point, 6 decimals)
// between Mallpoints (MLPTS) and Mallcoin (MLCNS).
//
// Despite the field name reading "MLPTS per MLCNS", the ratio is applied as
// MLCNS *minted per MLPTS spent*: mintedMlcns = (pointsAmount * this) / MLPTSPerMlcnsScale.
// 3_200_000 / 1_000_000 = 3.2, i.e. 1 MLPTS converts to 3.2 MLCNS — matching
// the KES-pegged economics (1 MLPTS ~= 2 KES, 1 MLCNS ~= 0.625 KES).
// See x/mallpoints/types/expected_keepers.go's MlcoinKeeper.GetConversionRatio
// doc comment (source of truth) and
// x/mallpoints/keeper/msg_server_convert_to_mallcoin.go's safeMulDiv call
// (mintedAmount = points * ratioFixed / scale) for the actual formula.
// Do NOT "fix" this to divide instead of multiply — that was tried before
// and silently mass-under-mints MLCNS on every conversion.
const DefaultMlptsPerMlcns uint64 = 3_200_000

// MLPTSPerMlcnsScale is the denominator for the fixed-point ratio stored in
// Params.MlptsPerMlcns.
const MLPTSPerMlcnsScale uint64 = 1_000_000

// NewParams creates a new Params instance.
func NewParams(
	burnWallet string,
	minStakeAmount uint64,
	mlptsPerMlcns uint64,
) Params {
	return Params{
		BurnWallet:     burnWallet,
		MinStakeAmount: minStakeAmount,
		MlptsPerMlcns:  mlptsPerMlcns,
	}
}

// DefaultParams returns a default set of parameters.
func DefaultParams() Params {
	return NewParams(
		DefaultBurnWallet,
		DefaultMinStakeAmount,
		DefaultMlptsPerMlcns,
	)
}

// Validate validates the set of params.
func (p Params) Validate() error {
	if err := validateBurnWallet(p.BurnWallet); err != nil {
		return err
	}
	if err := validateMinStakeAmount(p.MinStakeAmount); err != nil {
		return err
	}
	if err := validateMlptsPerMlcns(p.MlptsPerMlcns); err != nil {
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

// validateMinStakeAmount ensures the minimum stake floor is safe.
// MinStakeAmount == 0 is allowed at the param layer for chains that want to
// disable the gate; callers in the MsgStake keeper handler should treat 0
// as "apply RewardDivisor as floor" via effectiveMinStakeAmount.
func validateMinStakeAmount(v uint64) error {
	return nil
}

// validateMlptsPerMlcns rejects extreme conversion ratios. Allows 0 ("use
// compiled-in default") to keep zero-valued genesis Params valid, matching
// validateMinStakeAmount's 0-tolerant semantics. The 0 fallback is honored
// at the keeper layer by returning DefaultMlptsPerMlcns on a nil/0 read.
func validateMlptsPerMlcns(v uint64) error {
	if v > 1_000_000_000_000 {
		return fmt.Errorf("mlpts_per_mlcns > 1_000_000_000_000; unexpected hyperinflationary ratio")
	}
	return nil
}
