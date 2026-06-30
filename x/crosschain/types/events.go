package types

const (
	EventTypeBridgeInitiated   = "bridge_transfer_initiated"
	EventTypeBridgeCompleted   = "bridge_transfer_completed"
	EventTypeBridgeTimedOut    = "bridge_transfer_timed_out"
	EventTypeBridgeRefunded    = "bridge_transfer_refunded"
	EventTypeIBCRecv           = "bridge_ibc_recv"
	EventTypeParamsUpdated     = "crosschain_params_updated"
	EventTypeChainRouteUpdated = "chain_route_updated"
	EventTypeTransfersPruned   = "transfers_pruned"

	AttributeKeyTransferID  = "transfer_id"
	AttributeKeySender      = "sender"
	AttributeKeyRecipient   = "recipient"
	AttributeKeyAmount      = "amount"
	AttributeKeySourceChain = "source_chain"
	AttributeKeyDestChain   = "destination_chain"
	AttributeKeyStatus      = "status"
	AttributeKeyChannelID   = "channel_id"
	AttributeKeyPortID      = "port_id"
	AttributeKeyProof       = "proof"
)
