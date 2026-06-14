package types

// Account stores on-chain identity metadata for an address.
// This includes the registered public key (hex string) and a nonce
// that can be used for replay protection.
type Account struct {
	Address   string `json:"address"`
	PublicKey string `json:"public_key"`
	Nonce     uint64 `json:"nonce"`
}

// ProtoMessage implements the proto marker interface so this type can be
// used with the SDK codec helpers where a proto.Message is expected.
func (*Account) ProtoMessage() {}
