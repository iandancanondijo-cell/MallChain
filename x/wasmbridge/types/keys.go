package types

import "cosmossdk.io/collections"

const (
	ModuleName = "wasmbridge"
	StoreKey   = ModuleName
)

var (
	BridgeStateKey = collections.NewPrefix("bridge/state/")
)
