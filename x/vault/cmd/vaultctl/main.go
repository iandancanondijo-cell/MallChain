package main

import (
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"os"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"

	"marketplace/x/vault/keeper"
)

func usage() {
	fmt.Println("vaultctl - simple local vault helper\nCommands:\n  setup -password <pw> -account <acct> -issuer <iss>\n  confirm -password <pw> -code <totp> -priv <base64priv>\n  sign -password <pw> -code <totp> -msg <message>\n  disable -password <pw> -code <totp>")
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
		pw := fs.String("password", "", "password")
		acct := fs.String("account", "user@example.com", "account name")
		iss := fs.String("issuer", "marketplace", "issuer")
		fs.Parse(os.Args[2:])
		uri, err := k.SetupVault(nil, *pw, *acct, *iss)
		if err != nil {
			log.Fatalf("setup failed: %v", err)
		}
		fmt.Println("Provisioning URI:", uri)

	case "confirm":
		fs := flag.NewFlagSet("confirm", flag.ExitOnError)
		pw := fs.String("password", "", "password")
		code := fs.String("code", "", "totp code")
		privB64 := fs.String("priv", "", "base64 ed25519 private key (64 bytes)")
		fs.Parse(os.Args[2:])
		priv, err := base64.StdEncoding.DecodeString(*privB64)
		if err != nil {
			log.Fatalf("invalid private key: %v", err)
		}
		if err := k.ConfirmVault(nil, *pw, *code, priv); err != nil {
			log.Fatalf("confirm failed: %v", err)
		}
		fmt.Println("vault confirmed")

	case "sign":
		fs := flag.NewFlagSet("sign", flag.ExitOnError)
		pw := fs.String("password", "", "password")
		code := fs.String("code", "", "totp code")
		msg := fs.String("msg", "", "message to sign")
		fs.Parse(os.Args[2:])
		sig, err := k.UnlockAndSign(nil, *pw, *code, []byte(*msg))
		if err != nil {
			log.Fatalf("sign failed: %v", err)
		}
		fmt.Println("signature (base64):", base64.StdEncoding.EncodeToString(sig))

	case "disable":
		fs := flag.NewFlagSet("disable", flag.ExitOnError)
		pw := fs.String("password", "", "password")
		code := fs.String("code", "", "totp code")
		fs.Parse(os.Args[2:])
		if err := k.DisableVault(nil, *pw, *code); err != nil {
			log.Fatalf("disable failed: %v", err)
		}
		fmt.Println("vault disabled")

	default:
		usage()
		os.Exit(2)
	}
}
