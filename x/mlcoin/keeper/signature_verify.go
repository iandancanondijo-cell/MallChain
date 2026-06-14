package keeper

import (
	"crypto/ed25519"
	"encoding/hex"
)

// VerifyEd25519Hex verifies an ed25519 signature provided as hex strings.
// Returns true if signature is valid for message.
func VerifyEd25519Hex(pubHex string, sigBytes []byte, message []byte) bool {
	pub, err := hex.DecodeString(pubHex)
	if err != nil {
		return false
	}
	if len(pub) != ed25519.PublicKeySize {
		return false
	}
	return ed25519.Verify(pub, message, sigBytes)
}
