package types

// ActivityWindowVersionWindowed marks the x/mlcoin activity counters as
// windowed, i.e. rolled over every BlocksPerDay blocks by the keeper's
// dynamic-pricing tick rather than accumulating for the whole lifetime of the
// chain.
//
// ModuleIntervals is stored with a JSON value codec, so state written before
// this field existed decodes to the zero value. The pricing tick uses that as
// a one-time signal to discard the stale lifetime counters and start a clean
// window — see keeper.updateDynamicPricing.
const ActivityWindowVersionWindowed uint64 = 1

// ModuleIntervals holds block-based timing configuration for mlcoin.
type ModuleIntervals struct {
	DynamicPricingBlocks uint64 `json:"dynamic_pricing_blocks"`
	EmissionTickBlocks   uint64 `json:"emission_tick_blocks"`
	ConversionTickBlocks uint64 `json:"conversion_tick_blocks"`
	StakingLockBlocks    uint64 `json:"staking_lock_blocks"`
	BlocksPerDay         uint64 `json:"blocks_per_day"`
	BlocksPerMonth       uint64 `json:"blocks_per_month"`
	RewardDivisor        uint64 `json:"reward_divisor"`
	FeeRateBps           uint64 `json:"fee_rate_bps"`
	FeeSplitPercent      uint64 `json:"fee_split_percent"`

	// ActivityWindowVersion records which accounting model the persisted
	// ActivityMetrics counters belong to. 0 means pre-window (lifetime
	// cumulative) state.
	ActivityWindowVersion uint64 `json:"activity_window_version"`
}

func DefaultModuleIntervals() ModuleIntervals {
	return ModuleIntervals{
		DynamicPricingBlocks:  100,
		EmissionTickBlocks:    12000,
		ConversionTickBlocks:  12000,
		StakingLockBlocks:     1555200,
		BlocksPerDay:          17280,
		BlocksPerMonth:        129600,
		RewardDivisor:         18250,
		FeeRateBps:            100,
		FeeSplitPercent:       50,
		ActivityWindowVersion: ActivityWindowVersionWindowed,
	}
}

func (i ModuleIntervals) Validate() error {
	if i.DynamicPricingBlocks == 0 || i.EmissionTickBlocks == 0 || i.StakingLockBlocks == 0 {
		return ErrInvalidSupply
	}
	return nil
}
