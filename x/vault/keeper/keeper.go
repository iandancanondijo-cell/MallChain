package keeper

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/vault/crypto"
	"marketplace/x/vault/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
}

func NewKeeper(storeService corestore.KVStoreService, cdc codec.Codec) *Keeper {
	return &Keeper{storeService: storeService, cdc: cdc}
}

// helper to get raw KV store for this module
func (k Keeper) kvStore(ctx context.Context) (corestore.KVStore, error) {
	s := k.storeService.OpenKVStore(ctx)
	return s, nil
}

// getVault reads the vault blob (JSON) from KV and unmarshals it
func (k Keeper) getVault(ctx context.Context) (*types.VaultBlob, error) {
	s, err := k.kvStore(ctx)
	if err != nil {
		return nil, err
	}
	b, err := s.Get([]byte(types.VaultKey))
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return nil, nil
	}
	var vb types.VaultBlob
	if err := json.Unmarshal(b, &vb); err != nil {
		return nil, err
	}
	return &vb, nil
}

// setVault writes the vault blob
func (k Keeper) setVault(ctx context.Context, vb *types.VaultBlob) error {
	s, err := k.kvStore(ctx)
	if err != nil {
		return err
	}
	b, err := json.Marshal(vb)
	if err != nil {
		return err
	}
	return s.Set([]byte(types.VaultKey), b)
}

// SetupVault initializes salt/params and TOTP secret; returns provisioning URI.
func (k Keeper) SetupVault(ctx context.Context, password, accountName, issuer string) (string, error) {
	// generate salt
	salt, err := crypto.GenerateSalt(16)
	if err != nil {
		return "", err
	}
	params := crypto.DefaultParams()
	// derive key
	key := crypto.DeriveKey(password, salt, params)

	// generate TOTP secret and provisioning URI
	secret, uri, err := crypto.GenerateTOTPSecret(accountName, issuer)
	if err != nil {
		return "", err
	}
	// encrypt TOTP secret with derived key
	nonce, ct, err := crypto.Encrypt([]byte(secret), key)
	if err != nil {
		return "", err
	}

	vb := &types.VaultBlob{
		Salt:                base64.StdEncoding.EncodeToString(salt),
		Params:              types.Argon2Params{Time: params.Time, Memory: params.Memory, Threads: params.Threads, KeyLen: params.KeyLen},
		NonceTOTP:           base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:          "", // private key not yet provided
		EncryptedTOTPSecret: base64.StdEncoding.EncodeToString(ct),
		KDFVersion:          "argon2id_v1",
		FailedAttempts:      0,
		LockedUntilUnix:     0,
		PublicKey:           "",
	}

	if err := k.setVault(ctx, vb); err != nil {
		return "", err
	}
	return uri, nil
}

// ConfirmVault stores the encrypted private key after verifying an initial TOTP code
func (k Keeper) ConfirmVault(ctx context.Context, password, totpCode string, privKey []byte) error {
	vb, err := k.getVault(ctx)
	if err != nil {
		return err
	}
	if vb == nil {
		return errors.New("vault not initialized")
	}
	// derive key
	salt, err := base64.StdEncoding.DecodeString(vb.Salt)
	if err != nil {
		return errors.New("invalid vault salt encoding")
	}
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, crypto.Argon2Params{Time: params.Time, Memory: params.Memory, Threads: params.Threads, KeyLen: params.KeyLen})

	// decrypt TOTP secret (use dedicated nonce)
	ct, err := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	if err != nil {
		return errors.New("invalid TOTP secret encoding")
	}
	nonceTOTP, err := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	if err != nil {
		return errors.New("invalid TOTP nonce encoding")
	}
	secretBytes, err := crypto.Decrypt(nonceTOTP, ct, key)
	if err != nil {
		return err
	}
	secret := string(secretBytes)
	// verify TOTP
	if !crypto.VerifyTOTPCode(secret, totpCode) {
		return errors.New("invalid totp code")
	}

	// encrypt private key with derived key
	n2, c2, err := crypto.Encrypt(privKey, key)
	if err != nil {
		return err
	}
	// compute public key for ed25519
	if len(privKey) != ed25519.PrivateKeySize {
		return errors.New("private key must be ed25519 private key bytes")
	}
	pub := ed25519.PrivateKey(privKey).Public().(ed25519.PublicKey)

	vb.NoncePriv = base64.StdEncoding.EncodeToString(n2)
	vb.Ciphertext = base64.StdEncoding.EncodeToString(c2)
	vb.PublicKey = base64.StdEncoding.EncodeToString(pub)

	return k.setVault(ctx, vb)
}

// UnlockAndSign verifies password+TOTP, decrypts private key in-memory, signs message and returns signature.
func (k Keeper) UnlockAndSign(ctx context.Context, password, totpCode string, message []byte) ([]byte, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	vb, err := k.getVault(ctx)
	if err != nil {
		return nil, err
	}
	if vb == nil {
		return nil, errors.New("vault not initialized")
	}
	// check locked
	if vb.LockedUntilUnix > sdkCtx.BlockTime().Unix() {
		return nil, errors.New("vault locked due to failed attempts")
	}
	salt, err := base64.StdEncoding.DecodeString(vb.Salt)
	if err != nil {
		return nil, errors.New("invalid vault salt encoding")
	}
	// Use stored vault params instead of defaults
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, params)

	// decrypt TOTP secret (use dedicated nonce)
	ctT, err := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	if err != nil {
		return nil, errors.New("invalid TOTP secret encoding")
	}
	nonceT, err := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	if err != nil {
		return nil, errors.New("invalid TOTP nonce encoding")
	}
	secretBytes, err := crypto.Decrypt(nonceT, ctT, key)
	if err != nil {
		vb.FailedAttempts++
		if err := k.setVault(ctx, vb); err != nil {
			sdkCtx.Logger().Error("Failed to update vault failed attempts after decryption error", "error", err)
		}
		return nil, errors.New("invalid credentials")
	}
	if !crypto.VerifyTOTPCode(string(secretBytes), totpCode) {
		vb.FailedAttempts++
		if vb.FailedAttempts >= 5 {
			vb.LockedUntilUnix = sdkCtx.BlockTime().Add(5 * time.Minute).Unix()
		}

		if err := k.setVault(ctx, vb); err != nil {
			sdkCtx.Logger().Error("Failed to update vault failed attempts after invalid TOTP", "error", err)
		}
		return nil, errors.New("invalid totp code")
	}

	// decrypt private key (use dedicated nonce)
	ctPriv, err := base64.StdEncoding.DecodeString(vb.Ciphertext)
	if err != nil {
		return nil, errors.New("invalid private key ciphertext encoding")
	}
	noncePriv, err := base64.StdEncoding.DecodeString(vb.NoncePriv)
	if err != nil {
		return nil, errors.New("invalid private key nonce encoding")
	}
	privBytes, err := crypto.Decrypt(noncePriv, ctPriv, key)
	if err != nil {
		return nil, err
	}
	if len(privBytes) != ed25519.PrivateKeySize {
		return nil, errors.New("stored private key has invalid length")
	}
	sig := ed25519.Sign(ed25519.PrivateKey(privBytes), message)

	// reset failed attempts on success
	vb.FailedAttempts = 0
	vb.LockedUntilUnix = 0
	if err := k.setVault(ctx, vb); err != nil {
		sdkCtx.Logger().Error("Failed to reset vault failed attempts on success", "error", err)
	}

	return sig, nil
}

// DisableVault removes the vault record
func (k Keeper) DisableVault(ctx context.Context, password, totpCode string) error {
	vb, err := k.getVault(ctx)
	if err != nil {
		return err
	}
	if vb == nil {
		return errors.New("vault not initialized")
	}
	// verify password+totp as in UnlockAndSign but simpler: attempt to decrypt TOTP
	salt, err := base64.StdEncoding.DecodeString(vb.Salt)
	if err != nil {
		return errors.New("invalid vault salt encoding")
	}
	// Use stored vault params instead of defaults
	params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
	key := crypto.DeriveKey(password, salt, params)
	ctT, err := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
	if err != nil {
		return errors.New("invalid TOTP secret encoding")
	}
	nonceT, err := base64.StdEncoding.DecodeString(vb.NonceTOTP)
	if err != nil {
		return errors.New("invalid TOTP nonce encoding")
	}
	secretBytes, err := crypto.Decrypt(nonceT, ctT, key)
	if err != nil {
		return errors.New("invalid credentials")
	}
	if !crypto.VerifyTOTPCode(string(secretBytes), totpCode) {
		return errors.New("invalid credentials")
	}
	s, err := k.kvStore(ctx)
	if err != nil {
		return err
	}
	return s.Delete([]byte(types.VaultKey))
}

func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	if genState.Vault != nil {
		return k.setVault(ctx, genState.Vault)
	}
	return nil
}

func (k Keeper) ExportGenesis(ctx context.Context) (types.GenesisState, error) {
	vb, err := k.getVault(ctx)
	if err != nil {
		return types.GenesisState{}, err
	}
	return types.GenesisState{Vault: vb}, nil
}
