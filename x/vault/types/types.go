package types

const (
	// StoreKey for vault module
	StoreKey   = "vault"
	VaultKey   = "vault:record"
	ModuleName = "vault"
)

// Argon2Params mirrors the KDF params used by crypto helpers.
type Argon2Params struct {
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	KeyLen  uint32 `json:"key_len"`
}

// VaultBlob stores encrypted vault data as JSON in the KV store.
type VaultBlob struct {
	Salt                string       `json:"salt"`
	Params              Argon2Params `json:"params"`
	NonceTOTP           string       `json:"nonce_totp"`            // base64 nonce for TOTP ciphertext
	NoncePriv           string       `json:"nonce_priv"`            // base64 nonce for private-key ciphertext
	Ciphertext          string       `json:"ciphertext"`            // base64
	EncryptedTOTPSecret string       `json:"encrypted_totp_secret"` // base64
	KDFVersion          string       `json:"kdf_version"`
	FailedAttempts      int          `json:"failed_attempts"`
	LockedUntilUnix     int64        `json:"locked_until_unix"`
	PublicKey           string       `json:"public_key"` // base64
}
