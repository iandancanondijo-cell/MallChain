package types_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"marketplace/x/dex/types"
)

// Regression coverage: Params.Validate() only checked that the fee fields
// were non-empty strings — never that they actually parsed as decimals, or
// sat in a sane order. keeper.go's swap path calls
// math.LegacyMustNewDecFromStr(params.MinFee/MaxFee), which panics on a
// non-numeric string, and nothing checked MinFee <= DefaultFee <= MaxFee.

func validParams() types.Params {
	p := types.DefaultParams()
	return p
}

func TestParamsValidate_AcceptsDefaults(t *testing.T) {
	p := validParams()
	require.NoError(t, p.Validate())
}

func TestParamsValidate_RejectsNonNumericFee(t *testing.T) {
	p := validParams()
	p.MinFee = "not-a-number"
	require.Error(t, p.Validate())
}

func TestParamsValidate_RejectsMinFeeAboveMaxFee(t *testing.T) {
	p := validParams()
	p.MinFee = "0.05"
	p.MaxFee = "0.01"
	err := p.Validate()
	require.Error(t, err)
	require.Contains(t, err.Error(), "min fee")
}

func TestParamsValidate_RejectsDefaultFeeOutsideRange(t *testing.T) {
	p := validParams()
	p.MinFee = "0.001"
	p.MaxFee = "0.01"
	p.DefaultFee = "0.5"
	err := p.Validate()
	require.Error(t, err)
	require.Contains(t, err.Error(), "default fee")
}

func TestParamsValidate_RejectsNegativeFee(t *testing.T) {
	p := validParams()
	p.MinFee = "-0.001"
	require.Error(t, p.Validate())
}

func TestParamsValidate_RejectsMaxFeeAtOrAbove100Percent(t *testing.T) {
	p := validParams()
	p.MaxFee = "1"
	p.DefaultFee = "0.5"
	require.Error(t, p.Validate())
}

func TestParamsValidate_RejectsMaxPoolDrainPercentOutOfRange(t *testing.T) {
	tooHigh := validParams()
	tooHigh.MaxPoolDrainPercent = 31
	require.Error(t, tooHigh.Validate())

	zero := validParams()
	zero.MaxPoolDrainPercent = 0
	require.Error(t, zero.Validate())
}
