package keeper

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"

	corestore "cosmossdk.io/core/store"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/vault/types"
)

// Minimum Argon2id parameters the keeper will accept from a client-submitted
// MsgSetupVault. A weak choice here only weakens the submitting owner's own
// vault (nothing else in the chain depends on it), but rejecting clearly
// degenerate values still catches a broken/malicious client before it locks
// a real ciphertext behind a KDF cheap enough to brute-force offline —
// against a blob that's sitting in public chain state.
const (
	minArgon2Time    = 1
	minArgon2Memory  = 19 * 1024 // ~19 MiB, OWASP's Argon2id floor
	minArgon2Threads = 1
	minArgon2KeyLen  = 16
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

// GetVaultBlob reads owner's vault blob from KV. Returns (nil, nil) if the
// owner has no vault. Exported for the gRPC query server — reads are plain
// RPC, never broadcast or recorded in chain history, so serving the
// ciphertext blob here for client-side decryption is safe.
func (k Keeper) GetVaultBlob(ctx context.Context, owner string) (*types.VaultBlob, error) {
	return k.getVault(ctx, owner)
}

// getVault reads owner's vault blob (JSON) from KV and unmarshals it
func (k Keeper) getVault(ctx context.Context, owner string) (*types.VaultBlob, error) {
	s, err := k.kvStore(ctx)
	if err != nil {
		return nil, err
	}
	b, err := s.Get(types.VaultKeyFor(owner))
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

// setVault writes owner's vault blob
func (k Keeper) setVault(ctx context.Context, owner string, vb *types.VaultBlob) error {
	s, err := k.kvStore(ctx)
	if err != nil {
		return err
	}
	b, err := json.Marshal(vb)
	if err != nil {
		return err
	}
	return s.Set(types.VaultKeyFor(owner), b)
}

func validateArgon2Params(time, memory uint32, threads uint8, keyLen uint32) error {
	if time < minArgon2Time || memory < minArgon2Memory || threads < minArgon2Threads || keyLen < minArgon2KeyLen {
		return errors.New("argon2 parameters below minimum security floor")
	}
	return nil
}

func (k Keeper) emitEvent(ctx context.Context, eventType, owner string) {
	sdk.UnwrapSDKContext(ctx).EventManager().EmitEvent(sdk.NewEvent(
		eventType,
		sdk.NewAttribute(types.AttributeKeyOwner, owner),
	))
}

// SetupVault stores the KDF parameters and an already-encrypted TOTP secret
// for owner's vault. Everything sensitive here (salt, params, ciphertext)
// was already produced client-side — see tx.proto for why the chain must
// never receive a password or the plaintext TOTP secret. Fails if owner
// already has a vault, so a repeat call can't destroy previously confirmed
// key material.
func (k Keeper) SetupVault(ctx context.Context, owner, salt string, params types.Argon2Params, nonceTOTP, encryptedTOTPSecret string) error {
	existing, err := k.getVault(ctx, owner)
	if err != nil {
		return err
	}
	if existing != nil {
		return errors.New("vault already exists for this account")
	}
	if _, err := base64.StdEncoding.DecodeString(salt); err != nil {
		return errors.New("invalid salt encoding")
	}
	if _, err := base64.StdEncoding.DecodeString(nonceTOTP); err != nil {
		return errors.New("invalid TOTP nonce encoding")
	}
	if _, err := base64.StdEncoding.DecodeString(encryptedTOTPSecret); err != nil {
		return errors.New("invalid encrypted TOTP secret encoding")
	}
	if err := validateArgon2Params(params.Time, params.Memory, params.Threads, params.KeyLen); err != nil {
		return err
	}

	vb := &types.VaultBlob{
		Salt:                salt,
		Params:              params,
		NonceTOTP:           nonceTOTP,
		EncryptedTOTPSecret: encryptedTOTPSecret,
		KDFVersion:          "argon2id_v1",
	}

	if err := k.setVault(ctx, owner, vb); err != nil {
		return err
	}
	k.emitEvent(ctx, types.EventTypeVaultSetup, owner)
	return nil
}

// ConfirmVault finalizes owner's vault by storing the client-encrypted
// ed25519 private key and its (non-sensitive) public key. The client only
// calls this after decrypting its own just-submitted TOTP secret locally
// and confirming the user saved a working authenticator entry — the chain
// has no way to verify that itself without the plaintext secret, so it
// isn't asked to.
func (k Keeper) ConfirmVault(ctx context.Context, owner, noncePriv, ciphertext, publicKey string) error {
	vb, err := k.getVault(ctx, owner)
	if err != nil {
		return err
	}
	if vb == nil {
		return errors.New("vault not initialized")
	}
	if vb.Ciphertext != "" {
		return errors.New("vault already confirmed")
	}
	if _, err := base64.StdEncoding.DecodeString(noncePriv); err != nil {
		return errors.New("invalid private-key nonce encoding")
	}
	if _, err := base64.StdEncoding.DecodeString(ciphertext); err != nil {
		return errors.New("invalid ciphertext encoding")
	}
	pubBytes, err := base64.StdEncoding.DecodeString(publicKey)
	if err != nil {
		return errors.New("invalid public key encoding")
	}
	if len(pubBytes) != 32 { // ed25519.PublicKeySize
		return errors.New("public key must be an ed25519 public key")
	}

	vb.NoncePriv = noncePriv
	vb.Ciphertext = ciphertext
	vb.PublicKey = publicKey

	if err := k.setVault(ctx, owner, vb); err != nil {
		return err
	}
	k.emitEvent(ctx, types.EventTypeVaultConfirmed, owner)
	return nil
}

// DisableVault deletes owner's vault record. Authorization is the normal
// Cosmos Msg signer check (msg.GetSigners() requires owner's own signature)
// — there's no additional password/TOTP factor to check here since, as
// with setup/confirm, the chain can't verify either without seeing them in
// the clear.
func (k Keeper) DisableVault(ctx context.Context, owner string) error {
	vb, err := k.getVault(ctx, owner)
	if err != nil {
		return err
	}
	if vb == nil {
		return errors.New("vault not initialized")
	}
	s, err := k.kvStore(ctx)
	if err != nil {
		return err
	}
	if err := s.Delete(types.VaultKeyFor(owner)); err != nil {
		return err
	}
	k.emitEvent(ctx, types.EventTypeVaultDisabled, owner)
	return nil
}

func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	for _, ov := range genState.Vaults {
		if ov.Vault == nil {
			continue
		}
		if err := k.setVault(ctx, ov.Owner, ov.Vault); err != nil {
			return err
		}
	}
	return nil
}

func (k Keeper) ExportGenesis(ctx context.Context) (types.GenesisState, error) {
	s, err := k.kvStore(ctx)
	if err != nil {
		return types.GenesisState{}, err
	}

	prefix := []byte(types.VaultKeyPrefix)
	iter, err := s.Iterator(prefix, storetypes.PrefixEndBytes(prefix))
	if err != nil {
		return types.GenesisState{}, err
	}
	defer iter.Close()

	var out types.GenesisState
	for ; iter.Valid(); iter.Next() {
		owner := string(iter.Key()[len(prefix):])
		var vb types.VaultBlob
		if err := json.Unmarshal(iter.Value(), &vb); err != nil {
			return types.GenesisState{}, err
		}
		out.Vaults = append(out.Vaults, types.OwnerVault{Owner: owner, Vault: &vb})
	}
	return out, nil
}
