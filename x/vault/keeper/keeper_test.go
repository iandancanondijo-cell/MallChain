package keeper

import (
	"crypto/ed25519"
	"encoding/base64"
	"testing"

	tmtime "github.com/cometbft/cometbft/types/time"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	"github.com/stretchr/testify/require"

	"marketplace/x/vault/crypto"
	"marketplace/x/vault/types"

	"github.com/pquerna/otp/totp"
)

func TestVaultFlow(t *testing.T) {
	t.Helper()

	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	k := NewKeeper(storeService, nil)

	password := "strong-password-123!"
	uri, err := k.SetupVault(ctx, password, "user@example.com", "marketplace")
	require.NoError(t, err)
	require.Contains(t, uri, "otpauth://")

	// create ed25519 keypair
	pub, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)

	// try to confirm with an invalid TOTP code -> should fail
	err = k.ConfirmVault(ctx, password, "000000", priv)
	require.Error(t, err)
	_ = pub
}

func TestVaultSuccessFlow(t *testing.T) {
	t.Helper()

	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	k := NewKeeper(storeService, nil)
	password := "strong-password-123!"
	_, err := k.SetupVault(ctx, password, "user@example.com", "marketplace")
	require.NoError(t, err)

	// fetch blob and derive key to obtain TOTP secret for code generation
	vb, err := k.getVault(ctx)
	require.NoError(t, err)
	require.NotNil(t, vb)

	salt, err := base64.StdEncoding.DecodeString(vb.Salt)
	require.NoError(t, err)
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, params)

	ct, err := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	require.NoError(t, err)
	nonceT, err := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	require.NoError(t, err)
	secretBytes, err := crypto.Decrypt(nonceT, ct, key)
	require.NoError(t, err)
	secret := string(secretBytes)

	// generate current TOTP code
	code, err := totp.GenerateCode(secret, tmtime.Now())
	require.NoError(t, err)

	// create ed25519 keypair to confirm
	_, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)

	// confirm using real code
	require.NoError(t, k.ConfirmVault(ctx, password, code, priv))

	// sign a message
	msg := []byte("hello vault")
	sig, err := k.UnlockAndSign(ctx, password, code, msg)
	require.NoError(t, err)
	require.NotNil(t, sig)

	// verify signature against stored public key
	vb2, err := k.getVault(ctx)
	require.NoError(t, err)
	pkb, err := base64.StdEncoding.DecodeString(vb2.PublicKey)
	require.NoError(t, err)
	ok := ed25519.Verify(ed25519.PublicKey(pkb), msg, sig)
	require.True(t, ok)
}
