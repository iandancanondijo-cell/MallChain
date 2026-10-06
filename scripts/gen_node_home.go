// gen_node_home.go — Create key material for a fresh marketplaced node home.
//
// The marketplaced binary is node-runner-only: cmd/marketplaced/main.go wires
// up server commands but no `init`, and there is no key-generation subcommand.
// This helper reproduces what `cometbft init` does, using the same CometBFT
// library version as the binary itself (go.mod), so generated files are
// version-compatible by construction:
//
//   - config/node_key.json          (P2P identity)
//   - config/priv_validator_key.json + data/priv_validator_state.json
//   - config/config.toml            (library defaults, if missing)
//
// Usage (from the repository root):
//
//	go run scripts/gen_node_home.go <home-dir>
//
// LoadOrGen semantics: existing key files are kept, so re-running is safe.
// genesis.json and app.toml are intentionally NOT written here — install
// scripts must copy the committed canonical ones (blockchain_working/config/).
package main

import (
	"fmt"
	"os"
	"path/filepath"

	cmtcfg "github.com/cometbft/cometbft/config"
	"github.com/cometbft/cometbft/p2p"
	"github.com/cometbft/cometbft/privval"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run scripts/gen_node_home.go <home-dir>")
		os.Exit(1)
	}
	home := os.Args[1]

	cfg := cmtcfg.DefaultConfig()
	cfg.SetRoot(home)
	cmtcfg.EnsureRoot(home)

	privval.LoadOrGenFilePV(cfg.PrivValidatorKeyFile(), cfg.PrivValidatorStateFile())
	nodeKey, err := p2p.LoadOrGenNodeKey(cfg.NodeKeyFile())
	if err != nil {
		fmt.Fprintln(os.Stderr, "node key generation failed:", err)
		os.Exit(1)
	}

	fmt.Println("node id: ", nodeKey.ID())
	fmt.Println("config:  ", filepath.Join(cfg.RootDir, "config", "config.toml"))
	fmt.Println("privval: ", cfg.PrivValidatorKeyFile())
	fmt.Println("nodekey: ", cfg.NodeKeyFile())
}
