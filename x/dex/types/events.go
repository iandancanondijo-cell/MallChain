package types

// Event types for dex module
const (
	EventTypeCreatePool      = "create_pool"
	EventTypeAddLiquidity    = "add_liquidity"
	EventTypeRemoveLiquidity = "remove_liquidity"
	EventTypeSwap            = "swap"
)

// Attribute keys
const (
	AttributeKeyPoolId       = "pool_id"
	AttributeKeyCreator      = "creator"
	AttributeKeyTokenA       = "token_a"
	AttributeKeyTokenB       = "token_b"
	AttributeKeyProvider     = "provider"
	AttributeKeyTokenAAmount = "token_a_amount"
	AttributeKeyTokenBAmount = "token_b_amount"
	AttributeKeyTokenAOut    = "token_a_out"
	AttributeKeyTokenBOut    = "token_b_out"
	AttributeKeySender       = "sender"
	AttributeKeyTokenIn      = "token_in"
	AttributeKeyTokenOut     = "token_out"
)
