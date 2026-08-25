// vaultctl is a local reference implementation of the client-side vault
// flow: everything password/TOTP/private-key related happens here, in the
// "client," and only already-encrypted ciphertext ever crosses into the
// keeper — mirroring exactly what a real wallet frontend must do, since the
// chain itself must never receive a password or plaintext TOTP secret (see
// proto/marketplace/vault/v1/tx.proto for why).
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"os"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"

	"marketplace/x/vault/crypto"
	"marketplace/x/vault/keeper"
	"marketplace/x/vault/types"
)

func usage() {
	fmt.Println("vaultctl - simple local vault helper\nCommands:\n  setup -owner <o> -password <pw> -account <acct> -issuer <iss>\n  confirm -owner <o> -password <pw> -code <totp> -priv <base64priv>\n  sign -owner <o> -password <pw> -code <totp> -msg <message>\n  disable -owner <o>")
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	cmd := os.Args[1]

	storeKey := storetypes.NewKVStoreKey("vault")
	storeService := runtime.NewKVStoreService(storeKey)
	k := keeper.NewKeeper(storeService, nil)

	switch cmd {
	case "setup":
		fs := flag.NewFlagSet("setup", flag.ExitOnError)
		owner := fs.String("owner", "local", "vault owner identifier")
		pw := fs.String("password", "", "password")
		acct := fs.String("account", "user@example.com", "account name")
		iss := fs.String("issuer", "marketplace", "issuer")
		fs.Parse(os.Args[2:])

		// --- everything below this line is "client-side" ---
		salt, err := crypto.GenerateSalt(16)
		if err != nil {
			log.Fatalf("salt generation failed: %v", err)
		}
		params := crypto.DefaultParams()
		key := crypto.DeriveKey(*pw, salt, params)

		secret, uri, err := crypto.GenerateTOTPSecret(*acct, *iss)
		if err != nil {
			log.Fatalf("totp secret generation failed: %v", err)
		}
		nonce, ct, err := crypto.Encrypt([]byte(secret), key)
		if err != nil {
			log.Fatalf("encryption failed: %v", err)
		}
		// --- only ciphertext crosses into the keeper from here ---

		typesParams := types.Argon2Params{Time: params.Time, Memory: params.Memory, Threads: params.Threads, KeyLen: params.KeyLen}
		if err := k.SetupVault(nil, *owner, base64.StdEncoding.EncodeToString(salt),
			typesParams, base64.StdEncoding.EncodeToString(nonce), base64.StdEncoding.EncodeToString(ct)); err != nil {
			log.Fatalf("setup failed: %v", err)
		}
		fmt.Println("Provisioning URI (show as a QR code to the user):", uri)

	case "confirm":
		fs := flag.NewFlagSet("confirm", flag.ExitOnError)
		owner := fs.String("owner", "local", "vault owner identifier")
		pw := fs.String("password", "", "password")
		code := fs.String("code", "", "totp code")
		privB64 := fs.String("priv", "", "base64 ed25519 private key (64 bytes)")
		fs.Parse(os.Args[2:])

		priv, err := base64.StdEncoding.DecodeString(*privB64)
		if err != nil {
			log.Fatalf("invalid private key: %v", err)
		}
		if len(priv) != ed25519.PrivateKeySize {
			log.Fatalf("private key must be %d bytes", ed25519.PrivateKeySize)
		}

		vb, err := k.GetVaultBlob(nil, *owner)
		if err != nil || vb == nil {
			log.Fatalf("vault not found: %v", err)
		}

		// --- client-side: derive key, decrypt+verify TOTP locally ---
		salt, _ := base64.StdEncoding.DecodeString(vb.Salt)
		params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
		key := crypto.DeriveKey(*pw, salt, params)
		nonceTOTP, _ := base64.StdEncoding.DecodeString(vb.NonceTOTP)
		ctTOTP, _ := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
		secretBytes, err := crypto.Decrypt(nonceTOTP, ctTOTP, key)
		if err != nil {
			log.Fatalf("invalid password")
		}
		if !crypto.VerifyTOTPCode(string(secretBytes), *code) {
			log.Fatalf("invalid totp code")
		}

		// --- encrypt the signing key locally, then submit only ciphertext ---
		noncePriv, ctPriv, err := crypto.Encrypt(priv, key)
		if err != nil {
			log.Fatalf("encryption failed: %v", err)
		}
		pub := ed25519.PrivateKey(priv).Public().(ed25519.PublicKey)

		if err := k.ConfirmVault(nil, *owner, base64.StdEncoding.EncodeToString(noncePriv),
			base64.StdEncoding.EncodeToString(ctPriv), base64.StdEncoding.EncodeToString(pub)); err != nil {
			log.Fatalf("confirm failed: %v", err)
		}
		fmt.Println("vault confirmed")

	case "sign":
		// Signing never touches the keeper at all: everything needed to
		// produce a signature is decrypted and used locally, then discarded.
		fs := flag.NewFlagSet("sign", flag.ExitOnError)
		owner := fs.String("owner", "local", "vault owner identifier")
		pw := fs.String("password", "", "password")
		code := fs.String("code", "", "totp code")
		msg := fs.String("msg", "", "message to sign")
		fs.Parse(os.Args[2:])

		vb, err := k.GetVaultBlob(nil, *owner)
		if err != nil || vb == nil {
			log.Fatalf("vault not found: %v", err)
		}

		salt, _ := base64.StdEncoding.DecodeString(vb.Salt)
		params := crypto.Argon2Params{Time: vb.Params.Time, Memory: vb.Params.Memory, Threads: vb.Params.Threads, KeyLen: vb.Params.KeyLen}
		key := crypto.DeriveKey(*pw, salt, params)

		nonceTOTP, _ := base64.StdEncoding.DecodeString(vb.NonceTOTP)
		ctTOTP, _ := base64.StdEncoding.DecodeString(vb.EncryptedTOTPSecret)
		secretBytes, err := crypto.Decrypt(nonceTOTP, ctTOTP, key)
		if err != nil {
			log.Fatalf("invalid password")
		}
		if !crypto.VerifyTOTPCode(string(secretBytes), *code) {
			log.Fatalf("invalid totp code")
		}

		noncePriv, _ := base64.StdEncoding.DecodeString(vb.NoncePriv)
		ctPriv, _ := base64.StdEncoding.DecodeString(vb.Ciphertext)
		privBytes, err := crypto.Decrypt(noncePriv, ctPriv, key)
		if err != nil {
			log.Fatalf("failed to decrypt private key: %v", err)
		}

		sig := ed25519.Sign(ed25519.PrivateKey(privBytes), []byte(*msg))
		fmt.Println("signature (base64):", base64.StdEncoding.EncodeToString(sig))

	case "disable":
		fs := flag.NewFlagSet("disable", flag.ExitOnError)
		owner := fs.String("owner", "local", "vault owner identifier")
		fs.Parse(os.Args[2:])
		if err := k.DisableVault(nil, *owner); err != nil {
			log.Fatalf("disable failed: %v", err)
		}
		fmt.Println("vault disabled")

	default:
		usage()
		os.Exit(2)
	}
}
