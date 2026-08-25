package types

// Vault lifecycle events, so setup/confirm/disable activity is visible to
// any chain event listener/monitoring pipeline rather than only reflected
// silently in KV state.
const (
	EventTypeVaultSetup     = "vault_setup"
	EventTypeVaultConfirmed = "vault_confirmed"
	EventTypeVaultDisabled  = "vault_disabled"

	AttributeKeyOwner = "owner"
)
