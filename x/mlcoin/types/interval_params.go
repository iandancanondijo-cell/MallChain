package types

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
}

func DefaultModuleIntervals() ModuleIntervals {
	return ModuleIntervals{
		DynamicPricingBlocks: 100,
		EmissionTickBlocks:   12000,
		ConversionTickBlocks: 12000,
		StakingLockBlocks:    1555200,
		BlocksPerDay:         17280,
		BlocksPerMonth:       129600,
		RewardDivisor:        18250,
		FeeRateBps:           100,
		FeeSplitPercent:      50,
	}
}

func (i ModuleIntervals) Validate() error {
	if i.DynamicPricingBlocks == 0 || i.EmissionTickBlocks == 0 || i.StakingLockBlocks == 0 {
		return ErrInvalidSupply
	}
	return nil
}
