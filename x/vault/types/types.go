package types

const (
	// StoreKey for vault module
	StoreKey = "vault"
	// VaultKeyPrefix namespaces per-owner vault records: the full storage
	// key is VaultKeyPrefix+owner, so each account gets its own vault
	// instead of every account sharing one global record.
	VaultKeyPrefix = "vault:record:"
	ModuleName     = "vault"
)

// VaultKeyFor returns the storage key for a given owner's vault record.
func VaultKeyFor(owner string) []byte {
	return []byte(VaultKeyPrefix + owner)
}

// Argon2Params mirrors the KDF params used by crypto helpers.
type Argon2Params struct {
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	KeyLen  uint32 `json:"key_len"`
}

// VaultBlob stores an owner's encrypted key-recovery data as JSON in the KV
// store. Every field here is either non-sensitive metadata (salt, KDF
// params) or ciphertext the client produced — the chain never derives a
// key, verifies a password/TOTP code, or signs on the owner's behalf, so
// there's no failed-attempt/lockout state to track here anymore (see
// tx.proto for why: that verification used to happen in-keeper, which
// required the password to travel through a public Msg to get here).
type VaultBlob struct {
	Salt                string       `json:"salt"`
	Params              Argon2Params `json:"params"`
	NonceTOTP           string       `json:"nonce_totp"`            // base64 nonce for TOTP ciphertext
	NoncePriv           string       `json:"nonce_priv"`            // base64 nonce for private-key ciphertext
	Ciphertext          string       `json:"ciphertext"`            // base64
	EncryptedTOTPSecret string       `json:"encrypted_totp_secret"` // base64
	KDFVersion          string       `json:"kdf_version"`
	PublicKey           string       `json:"public_key"` // base64
}

// OwnerVault pairs a vault record with the account it belongs to, for
// genesis export/import of the per-owner vault store.
type OwnerVault struct {
	Owner string     `json:"owner"`
	Vault *VaultBlob `json:"vault"`
}

// GenesisState defines the vault module genesis state
type GenesisState struct {
	Vaults []OwnerVault `json:"vaults,omitempty"`
}

func (GenesisState) Reset()         {}
func (GenesisState) String() string { return "GenesisState{}" }
func (GenesisState) ProtoMessage()  {}

func DefaultGenesis() GenesisState {
	return GenesisState{}
}

func (gs GenesisState) Validate() error {
	return nil
}
