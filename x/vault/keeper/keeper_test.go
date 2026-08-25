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

// clientSetup simulates the client-side half of provisioning a vault:
// generate salt + TOTP secret, derive the Argon2id key, encrypt the secret
// — everything the keeper must never see happens here, in the "client."
// Returns the key (so the test can go on to simulate confirm/unlock) and
// the arguments a real client would submit in MsgSetupVault.
func clientSetup(t *testing.T, password string) (key []byte, secret string, salt string, params types.Argon2Params, nonceTOTP string, encTOTP string) {
	t.Helper()
	saltBytes, err := crypto.GenerateSalt(16)
	require.NoError(t, err)
	p := crypto.DefaultParams()
	key = crypto.DeriveKey(password, saltBytes, p)

	secret, _, err = crypto.GenerateTOTPSecret("user@example.com", "marketplace")
	require.NoError(t, err)

	nonce, ct, err := crypto.Encrypt([]byte(secret), key)
	require.NoError(t, err)

	salt = base64.StdEncoding.EncodeToString(saltBytes)
	params = types.Argon2Params{Time: p.Time, Memory: p.Memory, Threads: p.Threads, KeyLen: p.KeyLen}
	nonceTOTP = base64.StdEncoding.EncodeToString(nonce)
	encTOTP = base64.StdEncoding.EncodeToString(ct)
	return
}

func newTestKeeper(t *testing.T) (*Keeper, storetypes.StoreKey) {
	t.Helper()
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	return NewKeeper(runtime.NewKVStoreService(storeKey), nil), storeKey
}

func TestVaultSuccessFlow(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	owner := "mall1testowner"
	password := "strong-password-123!"
	key, secret, salt, params, nonceTOTP, encTOTP := clientSetup(t, password)

	require.NoError(t, k.SetupVault(ctx, owner, salt, params, nonceTOTP, encTOTP))

	// client-side: generate the current TOTP code from the secret it
	// already holds (it never round-trips through the chain)
	code, err := totp.GenerateCode(secret, tmtime.Now())
	require.NoError(t, err)

	pub, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)

	// client-side: verify the code locally before submitting anything
	require.True(t, crypto.VerifyTOTPCode(secret, code))

	noncePriv, ctPriv, err := crypto.Encrypt(priv, key)
	require.NoError(t, err)
	require.NoError(t, k.ConfirmVault(ctx, owner,
		base64.StdEncoding.EncodeToString(noncePriv),
		base64.StdEncoding.EncodeToString(ctPriv),
		base64.StdEncoding.EncodeToString(pub)))

	// signing happens entirely client-side — never touches the keeper
	msg := []byte("hello vault")
	sig := ed25519.Sign(priv, msg)
	require.True(t, ed25519.Verify(pub, msg, sig))

	// the stored public key must match what confirm submitted
	vb, err := k.GetVaultBlob(ctx, owner)
	require.NoError(t, err)
	pkb, err := base64.StdEncoding.DecodeString(vb.PublicKey)
	require.NoError(t, err)
	require.True(t, ed25519.Verify(ed25519.PublicKey(pkb), msg, sig))
}

// TestSetupVaultRejectsExistingOwner locks in the fix for SetupVault
// silently overwriting (and destroying) a previously confirmed vault: it
// used to never check whether a vault already existed before writing over
// it, so any address could call SetupVault again and wipe out the encrypted
// private key material for that owner.
func TestSetupVaultRejectsExistingOwner(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	owner := "mall1testowner"
	_, _, salt, params, nonceTOTP, encTOTP := clientSetup(t, "pw-one")
	require.NoError(t, k.SetupVault(ctx, owner, salt, params, nonceTOTP, encTOTP))

	vbBefore, err := k.GetVaultBlob(ctx, owner)
	require.NoError(t, err)

	_, _, salt2, params2, nonceTOTP2, encTOTP2 := clientSetup(t, "pw-two")
	require.Error(t, k.SetupVault(ctx, owner, salt2, params2, nonceTOTP2, encTOTP2))

	vbAfter, err := k.GetVaultBlob(ctx, owner)
	require.NoError(t, err)
	require.Equal(t, vbBefore, vbAfter, "vault must be unchanged after a rejected re-setup")
}

// TestVaultsArePerOwner locks in the fix for the single global vault
// record: two different owners' SetupVault calls used to collide on the
// same fixed KV key, so the second call would silently clobber the first
// owner's vault (encrypted key material and all).
func TestVaultsArePerOwner(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	ownerA, ownerB := "mall1ownera", "mall1ownerb"
	_, _, saltA, paramsA, nonceA, encA := clientSetup(t, "pw-a")
	require.NoError(t, k.SetupVault(ctx, ownerA, saltA, paramsA, nonceA, encA))
	_, _, saltB, paramsB, nonceB, encB := clientSetup(t, "pw-b")
	require.NoError(t, k.SetupVault(ctx, ownerB, saltB, paramsB, nonceB, encB))

	vbA, err := k.GetVaultBlob(ctx, ownerA)
	require.NoError(t, err)
	vbB, err := k.GetVaultBlob(ctx, ownerB)
	require.NoError(t, err)

	require.NotNil(t, vbA)
	require.NotNil(t, vbB)
	require.NotEqual(t, vbA.Salt, vbB.Salt, "each owner must get an independent vault")

	// disabling A must not touch B's vault
	require.NoError(t, k.DisableVault(ctx, ownerA))
	vbBAfter, err := k.GetVaultBlob(ctx, ownerB)
	require.NoError(t, err)
	require.Equal(t, vbB, vbBAfter)

	vbAAfter, err := k.GetVaultBlob(ctx, ownerA)
	require.NoError(t, err)
	require.Nil(t, vbAAfter)
}

func TestSetupVaultRejectsWeakArgon2Params(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	saltBytes, err := crypto.GenerateSalt(16)
	require.NoError(t, err)
	salt := base64.StdEncoding.EncodeToString(saltBytes)

	err = k.SetupVault(ctx, "mall1weak", salt, types.Argon2Params{Time: 0, Memory: 1, Threads: 1, KeyLen: 32},
		base64.StdEncoding.EncodeToString([]byte("n")), base64.StdEncoding.EncodeToString([]byte("c")))
	require.Error(t, err)
}
