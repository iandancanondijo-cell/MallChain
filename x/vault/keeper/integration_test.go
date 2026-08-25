package keeper

import (
	"encoding/base64"
	"testing"

	storetypes "cosmossdk.io/store/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/cosmos/cosmos-sdk/testutil"
	"github.com/stretchr/testify/require"

	"marketplace/x/vault/crypto"
	"marketplace/x/vault/types"
)

func hasEventType(events sdk.Events, eventType string) bool {
	for _, ev := range events {
		if ev.Type == eventType {
			return true
		}
	}
	return false
}

// TestVaultLifecycleEvents locks in observability for vault lifecycle
// changes: setup, confirm, and disable must each emit their event so a
// chain listener/monitoring pipeline can see vault activity, not just KV
// state that nothing observes.
func TestVaultLifecycleEvents(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	baseCtx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	owner := "mall1eventowner"

	_, _, salt, params, nonceTOTP, encTOTP := clientSetup(t, "pw-events")

	ctx := baseCtx.WithEventManager(sdk.NewEventManager())
	require.NoError(t, k.SetupVault(ctx, owner, salt, params, nonceTOTP, encTOTP))
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultSetup))

	saltBytes, _ := base64.StdEncoding.DecodeString(salt)
	argonParams := crypto.Argon2Params{Time: params.Time, Memory: params.Memory, Threads: params.Threads, KeyLen: params.KeyLen}
	key := crypto.DeriveKey("pw-events", saltBytes, argonParams)
	noncePriv, ctPriv, err := crypto.Encrypt([]byte("32-byte-fake-ed25519-priv-key!!!"), key)
	require.NoError(t, err)

	ctx = baseCtx.WithEventManager(sdk.NewEventManager())
	require.NoError(t, k.ConfirmVault(ctx, owner,
		base64.StdEncoding.EncodeToString(noncePriv),
		base64.StdEncoding.EncodeToString(ctPriv),
		base64.StdEncoding.EncodeToString(make([]byte, 32))))
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultConfirmed))

	ctx = baseCtx.WithEventManager(sdk.NewEventManager())
	require.NoError(t, k.DisableVault(ctx, owner))
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultDisabled))

	vb, err := k.GetVaultBlob(baseCtx, owner)
	require.NoError(t, err)
	require.Nil(t, vb)
}

// TestConfirmVaultRejectsDoubleConfirm locks in that a vault can't be
// re-confirmed with a different key once it already holds one — there's no
// password/TOTP check left in the keeper to gate this, so the "already has
// ciphertext" state itself is what must block a second write.
func TestConfirmVaultRejectsDoubleConfirm(t *testing.T) {
	k, storeKey := newTestKeeper(t)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	owner := "mall1doubleconfirm"

	_, _, salt, params, nonceTOTP, encTOTP := clientSetup(t, "pw")
	require.NoError(t, k.SetupVault(ctx, owner, salt, params, nonceTOTP, encTOTP))

	require.NoError(t, k.ConfirmVault(ctx, owner,
		base64.StdEncoding.EncodeToString([]byte("nonce123456789")),
		base64.StdEncoding.EncodeToString([]byte("ciphertext")),
		base64.StdEncoding.EncodeToString(make([]byte, 32))))

	err := k.ConfirmVault(ctx, owner,
		base64.StdEncoding.EncodeToString([]byte("nonce223456789")),
		base64.StdEncoding.EncodeToString([]byte("different-ciphertext")),
		base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.Error(t, err)
}
