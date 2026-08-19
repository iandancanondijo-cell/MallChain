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

	owner := "mall1testowner"
	password := "strong-password-123!"
	uri, err := k.SetupVault(ctx, owner, password, "user@example.com", "marketplace")
	require.NoError(t, err)
	require.Contains(t, uri, "otpauth://")

	// create ed25519 keypair
	pub, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)

	// try to confirm with an invalid TOTP code -> should fail
	err = k.ConfirmVault(ctx, owner, password, "000000", priv)
	require.Error(t, err)
	_ = pub
}

func TestVaultSuccessFlow(t *testing.T) {
	t.Helper()

	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	k := NewKeeper(storeService, nil)
	owner := "mall1testowner"
	password := "strong-password-123!"
	_, err := k.SetupVault(ctx, owner, password, "user@example.com", "marketplace")
	require.NoError(t, err)

	// fetch blob and derive key to obtain TOTP secret for code generation
	vb, err := k.getVault(ctx, owner)
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
	require.NoError(t, k.ConfirmVault(ctx, owner, password, code, priv))

	// sign a message
	msg := []byte("hello vault")
	sig, err := k.UnlockAndSign(ctx, owner, password, code, msg)
	require.NoError(t, err)
	require.NotNil(t, sig)

	// verify signature against stored public key
	vb2, err := k.getVault(ctx, owner)
	require.NoError(t, err)
	pkb, err := base64.StdEncoding.DecodeString(vb2.PublicKey)
	require.NoError(t, err)
	ok := ed25519.Verify(ed25519.PublicKey(pkb), msg, sig)
	require.True(t, ok)
}

// TestSetupVaultRejectsExistingOwner locks in the fix for SetupVault
// silently overwriting (and destroying) a previously confirmed vault: it
// used to never check whether a vault already existed before writing over
// it, so any address could call SetupVault again and wipe out the encrypted
// private key material for that owner.
func TestSetupVaultRejectsExistingOwner(t *testing.T) {
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	k := NewKeeper(storeService, nil)

	owner := "mall1testowner"
	_, err := k.SetupVault(ctx, owner, "pw-one", "u@ex", "mp")
	require.NoError(t, err)

	vbBefore, err := k.getVault(ctx, owner)
	require.NoError(t, err)

	_, err = k.SetupVault(ctx, owner, "pw-two", "u@ex", "mp")
	require.Error(t, err)

	vbAfter, err := k.getVault(ctx, owner)
	require.NoError(t, err)
	require.Equal(t, vbBefore, vbAfter, "vault must be unchanged after a rejected re-setup")
}

// TestVaultsArePerOwner locks in the fix for the single global vault
// record: two different owners' SetupVault calls used to collide on the
// same fixed KV key, so the second call would silently clobber the first
// owner's vault (encrypted key material and all).
func TestVaultsArePerOwner(t *testing.T) {
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	k := NewKeeper(storeService, nil)

	ownerA, ownerB := "mall1ownera", "mall1ownerb"
	_, err := k.SetupVault(ctx, ownerA, "pw-a", "a@ex", "mp")
	require.NoError(t, err)
	_, err = k.SetupVault(ctx, ownerB, "pw-b", "b@ex", "mp")
	require.NoError(t, err)

	vbA, err := k.getVault(ctx, ownerA)
	require.NoError(t, err)
	vbB, err := k.getVault(ctx, ownerB)
	require.NoError(t, err)

	require.NotNil(t, vbA)
	require.NotNil(t, vbB)
	require.NotEqual(t, vbA.Salt, vbB.Salt, "each owner must get an independent vault")

	// disabling A must not touch B's vault
	require.Error(t, k.DisableVault(ctx, ownerA, "pw-a", "000000")) // wrong totp code, expected to fail
	vbBAfter, err := k.getVault(ctx, ownerB)
	require.NoError(t, err)
	require.Equal(t, vbB, vbBAfter)
}
