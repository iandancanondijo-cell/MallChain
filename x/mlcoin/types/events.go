package types

const (
	EventTypeTransfer     = "mlcoin_transfer"
	EventTypeStake        = "mlcoin_stake"
	EventTypeUnstake      = "mlcoin_unstake"
	EventTypeMint         = "mlcoin_mint"
	EventTypeDynamicPrice = "mlcoin_dynamic_pricing"
	EventTypeEmission     = "mlcoin_emission_update"
	EventTypeConversion   = "mlcoin_conversion_window"
	EventTypeParamsUpdate = "mlcoin_params_updated"

	AttributeKeyFrom    = "from"
	AttributeKeyTo      = "to"
	AttributeKeyAddress = "address"
	AttributeKeyTxID    = "tx_id"
	AttributeKeyStakeID = "stake_id"
	AttributeKeyAmount  = "amount"
	AttributeKeyFee     = "fee"
)
