package types

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	// ModuleName defines the module name
	ModuleName = "dex"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// RouterKey defines the module's message routing key
	RouterKey = ModuleName

	// QuerierRoute defines the module's query routing key
	QuerierRoute = ModuleName
)

// MemStoreKey defines the in-memory store key
var MemStoreKey = "mem_" + ModuleName

// Key prefixes for the dex module
var (
	// PoolsKeyPrefix is the prefix for pool keys
	PoolsKeyPrefix = []byte{0x01}

	// PoolLiquidityKeyPrefix is the prefix for pool liquidity keys
	PoolLiquidityKeyPrefix = []byte{0x02}

	// ParamsKey is the key for module parameters
	ParamsKey = []byte{0x03}

	// NextPoolIdKey is the key for the next pool ID
	NextPoolIdKey = []byte{0x04}
)

// GetPoolKey returns the key for a specific pool
func GetPoolKey(poolId uint64) []byte {
	return append(PoolsKeyPrefix, sdk.Uint64ToBigEndian(poolId)...)
}

// GetPoolLiquidityKey returns the key for pool liquidity
func GetPoolLiquidityKey(poolId uint64, address sdk.AccAddress) []byte {
	return append(PoolLiquidityKeyPrefix, append(sdk.Uint64ToBigEndian(poolId), address...)...)
}
