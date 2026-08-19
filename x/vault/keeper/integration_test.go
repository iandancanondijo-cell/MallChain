package keeper

import (
	"crypto/ed25519"
	"encoding/base64"
	"testing"

	tmtime "github.com/cometbft/cometbft/types/time"

	storetypes "cosmossdk.io/store/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	"github.com/stretchr/testify/require"

	"marketplace/x/vault/crypto"
	"marketplace/x/vault/types"

	"github.com/pquerna/otp/totp"
)

func hasEventType(events sdk.Events, eventType string) bool {
	for _, ev := range events {
		if ev.Type == eventType {
			return true
		}
	}
	return false
}

func TestLockoutAndDisable(t *testing.T) {
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	k := NewKeeper(storeService, nil)

	owner := "mall1testowner"
	password := "pw-xyz"
	_, err := k.SetupVault(ctx, owner, password, "u@ex", "mp")
	require.NoError(t, err)

	// fetch secret
	vb, err := k.getVault(ctx, owner)
	require.NoError(t, err)
	salt, err := base64.StdEncoding.DecodeString(vb.Salt)
	require.NoError(t, err)
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, params)
	ct, err := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	require.NoError(t, err)
	nonceT, err := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	require.NoError(t, err)
	secret, err := crypto.Decrypt(nonceT, ct, key)
	require.NoError(t, err)

	code, err := totp.GenerateCode(string(secret), tmtime.Now())
	require.NoError(t, err)

	// confirm with proper code
	_, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	require.NoError(t, k.ConfirmVault(ctx, owner, password, code, priv))

	// attempt invalid TOTPs with correct password to trigger lockout
	for i := 0; i < 6; i++ {
		_, err := k.UnlockAndSign(ctx, owner, password, "000000", []byte("m"))
		require.Error(t, err)
		if i == 5 {
			// after 5 failed TOTP verifications it should be locked
			vb2, _ := k.getVault(ctx, owner)
			require.True(t, vb2.LockedUntilUnix > tmtime.Now().Unix())
		}
	}

	// disable should fail with wrong totp
	require.Error(t, k.DisableVault(ctx, owner, password, "000000"))

	// now generate proper code and disable
	vb3, err := k.getVault(ctx, owner)
	require.NoError(t, err)
	salt3, _ := base64.StdEncoding.DecodeString(vb3.Salt)
	key3 := crypto.DeriveKey(password, salt3, params)
	ct3, _ := base64.StdEncoding.DecodeString(vb3.EncryptedTOTPSecret)
	nonce3, _ := base64.StdEncoding.DecodeString(vb3.NonceTOTP)
	sec3, _ := crypto.Decrypt(nonce3, ct3, key3)
	code2, _ := totp.GenerateCode(string(sec3), tmtime.Now())
	require.NoError(t, k.DisableVault(ctx, owner, password, code2))

	// ensure deleted
	vb4, err := k.getVault(ctx, owner)
	require.NoError(t, err)
	require.Nil(t, vb4)
}

// TestVaultEventsEmittedOnFailedUnlockAndLockout locks in monitoring
// visibility for vault brute-force activity: a failed unlock must emit
// vault_unlock_failed, crossing the lockout threshold must additionally
// emit vault_locked, and attempting to unlock an already-locked vault must
// emit vault_unlock_rejected_locked — otherwise this security-relevant
// activity is only ever reflected in KV state that no listener observes.
func TestVaultEventsEmittedOnFailedUnlockAndLockout(t *testing.T) {
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	baseCtx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	k := NewKeeper(storeService, nil)

	owner := "mall1eventowner"
	password := "pw-events"
	_, err := k.SetupVault(baseCtx, owner, password, "u@ex", "mp")
	require.NoError(t, err)

	vb, err := k.getVault(baseCtx, owner)
	require.NoError(t, err)
	salt, _ := base64.StdEncoding.DecodeString(vb.Salt)
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, params)
	ct, _ := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	nonceT, _ := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	secret, _ := crypto.Decrypt(nonceT, ct, key)
	code, err := totp.GenerateCode(string(secret), tmtime.Now())
	require.NoError(t, err)
	_, priv, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	require.NoError(t, k.ConfirmVault(baseCtx, owner, password, code, priv))

	// A single failed unlock must emit vault_unlock_failed but not vault_locked.
	ctx := baseCtx.WithEventManager(sdk.NewEventManager())
	_, err = k.UnlockAndSign(ctx, owner, password, "000000", []byte("m"))
	require.Error(t, err)
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultUnlockFailed))
	require.False(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultLocked))

	// Drive to the lockout threshold (5 total failures); the 5th must also emit vault_locked.
	for i := 0; i < 3; i++ {
		ctx = baseCtx.WithEventManager(sdk.NewEventManager())
		_, err = k.UnlockAndSign(ctx, owner, password, "000000", []byte("m"))
		require.Error(t, err)
	}
	ctx = baseCtx.WithEventManager(sdk.NewEventManager())
	_, err = k.UnlockAndSign(ctx, owner, password, "000000", []byte("m")) // 5th failure
	require.Error(t, err)
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultLocked))

	// Now locked: a further attempt must be rejected via vault_unlock_rejected_locked,
	// not counted as another failed-TOTP attempt.
	ctx = baseCtx.WithEventManager(sdk.NewEventManager())
	_, err = k.UnlockAndSign(ctx, owner, password, code, []byte("m"))
	require.Error(t, err)
	require.True(t, hasEventType(ctx.EventManager().Events(), types.EventTypeVaultUnlockRejected))
}
