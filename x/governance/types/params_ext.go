package types

import (
	"time"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Module parameter defaults for governance.
const (
	DefaultVotingPeriodDays  = 7
	DefaultDepositPeriodDays = 2
	DefaultQuorum            = "0.334000000000000000"
	DefaultThreshold         = "0.500000000000000000"
	DefaultVetoThreshold     = "0.334000000000000000"
)

// DefaultParams returns production-safe governance defaults.
func DefaultParams() Params {
	return Params{
		MinDeposit: sdk.NewCoins(sdk.NewInt64Coin("stake", 1000)),
		VotingPeriod: DefaultVotingPeriodDays * 24 * time.Hour,
		Quorum:       math.LegacyMustNewDecFromStr(DefaultQuorum),
		Threshold:    math.LegacyMustNewDecFromStr(DefaultThreshold),
		VetoThreshold: math.LegacyMustNewDecFromStr(DefaultVetoThreshold),
	}
}

// GetDepositPeriod returns the configured deposit period, defaulting to one third of voting period.
func (p Params) GetDepositPeriod() time.Duration {
	if p.VotingPeriod == 0 {
		return DefaultDepositPeriodDays * 24 * time.Hour
	}
	third := p.VotingPeriod / 3
	if third <= 0 {
		return DefaultDepositPeriodDays * 24 * time.Hour
	}
	return third
}
