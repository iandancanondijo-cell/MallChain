package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base32"
	"fmt"
	"io"
	"os"
	"strconv"

	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/argon2"
)

const (
	EnvArgon2Time    = "VAULT_ARGON2_TIME"
	EnvArgon2Memory  = "VAULT_ARGON2_MEMORY"
	EnvArgon2Threads = "VAULT_ARGON2_THREADS"
)

var (
	productionParams = Argon2Params{
		Time:    5,              // Increased from 3 for production
		Memory:  128 * 1024,     // 128 MB (was 64 MB)
		Threads: 8,              // Increased from 4 for production
		KeyLen:  32,              // 256-bit key
	}
)

type Argon2Params struct {
	Time    uint32
	Memory  uint32
	Threads uint8
	KeyLen  uint32
}

func DefaultParams() Argon2Params {
	params := productionParams

	if v := os.Getenv(EnvArgon2Time); v != "" {
		if t, err := strconv.ParseUint(v, 10, 32); err == nil {
			params.Time = uint32(t)
		}
	}
	if v := os.Getenv(EnvArgon2Memory); v != "" {
		if m, err := strconv.ParseUint(v, 10, 32); err == nil {
			params.Memory = uint32(m)
		}
	}
	if v := os.Getenv(EnvArgon2Threads); v != "" {
		if t, err := strconv.ParseUint(v, 10, 8); err == nil {
			params.Threads = uint8(t)
		}
	}

	return params
}

func ProductionParams() Argon2Params {
	return productionParams
}

func GenerateSalt(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, err
	}
	return b, nil
}

func DeriveKey(password string, salt []byte, p Argon2Params) []byte {
	return argon2.IDKey([]byte(password), salt, p.Time, p.Memory, p.Threads, p.KeyLen)
}

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

func GenerateTOTPSecret(accountName, issuer string) (secret string, provisioningURI string, err error) {
	k, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return "", "", err
	}
	return k.Secret(), k.URL(), nil
}

func VerifyTOTPCode(secret, code string) bool {
	return totp.Validate(code, secret)
}

func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return b, nil
}

func Base32Encode(b []byte) string {
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
}

func Base32Decode(s string) ([]byte, error) {
	return base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(s)
}