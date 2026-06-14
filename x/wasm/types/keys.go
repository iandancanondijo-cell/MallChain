package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "wasm"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName
)

var (
	// CodeKey is the prefix to retrieve contract code
	CodeKey = collections.NewPrefix("code")

	// ContractKey is the prefix to retrieve contracts
	ContractKey = collections.NewPrefix("contract")
)