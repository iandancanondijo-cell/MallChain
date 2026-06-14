package crypto

import (
	"testing"

	tmtime "github.com/cometbft/cometbft/types/time"

	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
)

func TestDeriveEncryptDecrypt(t *testing.T) {
	p := DefaultParams()
	salt, err := GenerateSalt(16)
	require.NoError(t, err)

	key := DeriveKey("s3cureP@ssw0rd", salt, p)
	require.Len(t, key, int(p.KeyLen))

	plaintext := []byte("this-is-a-test-private-key")
	nonce, ct, err := Encrypt(plaintext, key)
	require.NoError(t, err)
	require.NotEmpty(t, nonce)
	require.NotEmpty(t, ct)

	pt, err := Decrypt(nonce, ct, key)
	require.NoError(t, err)
	require.Equal(t, plaintext, pt)
}

func TestTOTPGenerationAndValidation(t *testing.T) {
	account := "user@example.com"
	issuer := "marketplace"

	secret, uri, err := GenerateTOTPSecret(account, issuer)
	require.NoError(t, err)
	require.NotEmpty(t, secret)
	require.Contains(t, uri, "otpauth://")

	// generate current code and validate
	code, err := totp.GenerateCode(secret, tmtime.Now())
	require.NoError(t, err)
	require.True(t, VerifyTOTPCode(secret, code))
}
