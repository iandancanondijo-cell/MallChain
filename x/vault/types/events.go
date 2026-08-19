package types

// Vault security events. Emitted so failed-unlock/lockout activity — a
// signal of a possible brute-force attempt against a custody vault — is
// visible to any chain event listener/monitoring pipeline, not just
// reflected silently in KV state that nothing observes.
const (
	EventTypeVaultUnlockFailed   = "vault_unlock_failed"
	EventTypeVaultLocked         = "vault_locked"
	EventTypeVaultUnlockRejected = "vault_unlock_rejected_locked"

	AttributeKeyOwner          = "owner"
	AttributeKeyFailedAttempts = "failed_attempts"
	AttributeKeyLockedUntil    = "locked_until_unix"
	AttributeKeyReason         = "reason"
)
