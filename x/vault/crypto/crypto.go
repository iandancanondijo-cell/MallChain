package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base32"
	"fmt"
	"io"

	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/argon2"
)

// Argon2Params holds parameters for Argon2id key derivation.
type Argon2Params struct {
	Time    uint32 // iterations
	Memory  uint32 // KiB
	Threads uint8
	KeyLen  uint32
}

// DefaultParams returns reasonable defaults tuned for development. Adjust for production.
func DefaultParams() Argon2Params {
	return Argon2Params{
		Time:    3,
		Memory:  64 * 1024, // 64 MB
		Threads: 4,
		KeyLen:  32,
	}
}

// GenerateSalt returns securely generated random bytes of given size.
func GenerateSalt(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, err
	}
	return b, nil
}

// DeriveKey derives a key from the password and salt using Argon2id and given params.
func DeriveKey(password string, salt []byte, p Argon2Params) []byte {
	return argon2.IDKey([]byte(password), salt, p.Time, p.Memory, p.Threads, p.KeyLen)
}

// Encrypt encrypts plaintext using AES-256-GCM. Returns nonce and ciphertext.
func Encrypt(plaintext, key []byte) (nonce, ciphertext []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	ciphertext = gcm.Seal(nil, nonce, plaintext, nil)
	return nonce, ciphertext, nil
}

// Decrypt decrypts AES-GCM ciphertext using nonce and key.
func Decrypt(nonce, ciphertext, key []byte) (plaintext []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	pt, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}
	return pt, nil
}

// GenerateTOTPSecret creates a new base32-encoded TOTP secret and provisioning URI.
func GenerateTOTPSecret(accountName, issuer string) (secret string, provisioningURI string, err error) {
	// Use pquerna's Generate to create a TOTP key
	k, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return "", "", err
	}
	// secret is base32 and URL is a provisioning URI
	return k.Secret(), k.URL(), nil
}

// VerifyTOTPCode verifies a TOTP code against the secret with a standard tolerance window.
func VerifyTOTPCode(secret, code string) bool {
	// allow default options with +/-1 step window
	return totp.Validate(code, secret)
}

// Helper for tests: GenerateRandomBytes
func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return b, nil
}

// Helper: Base32Encode
func Base32Encode(b []byte) string {
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
}

// Helper: Base32Decode
func Base32Decode(s string) ([]byte, error) {
	return base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(s)
}
