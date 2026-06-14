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

func TestLockoutAndDisable(t *testing.T) {
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	k := NewKeeper(storeService, nil)

	password := "pw-xyz"
	_, err := k.SetupVault(ctx, password, "u@ex", "mp")
	require.NoError(t, err)

	// fetch secret
	vb, err := k.getVault(ctx)
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
	require.NoError(t, k.ConfirmVault(ctx, password, code, priv))

	// attempt invalid TOTPs with correct password to trigger lockout
	for i := 0; i < 6; i++ {
		_, err := k.UnlockAndSign(ctx, password, "000000", []byte("m"))
		require.Error(t, err)
		if i == 5 {
			// after 5 failed TOTP verifications it should be locked
			vb2, _ := k.getVault(ctx)
			require.True(t, vb2.LockedUntilUnix > tmtime.Now().Unix())
		}
	}

	// disable should fail with wrong totp
	require.Error(t, k.DisableVault(ctx, password, "000000"))

	// now generate proper code and disable
	vb3, err := k.getVault(ctx)
	require.NoError(t, err)
	salt3, _ := base64.StdEncoding.DecodeString(vb3.Salt)
	key3 := crypto.DeriveKey(password, salt3, params)
	ct3, _ := base64.StdEncoding.DecodeString(vb3.EncryptedTOTPSecret)
	nonce3, _ := base64.StdEncoding.DecodeString(vb3.NonceTOTP)
	sec3, _ := crypto.Decrypt(nonce3, ct3, key3)
	code2, _ := totp.GenerateCode(string(sec3), tmtime.Now())
	require.NoError(t, k.DisableVault(ctx, password, code2))

	// ensure deleted
	vb4, err := k.getVault(ctx)
	require.NoError(t, err)
	require.Nil(t, vb4)
}
