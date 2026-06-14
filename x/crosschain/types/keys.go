package types

import (
	"encoding/binary"
	"fmt"
)

const (
	// ModuleName defines the module name
	ModuleName = "crosschain"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// RouterKey defines the module's message routing key
	RouterKey = ModuleName

	// MemStoreKey defines the in-memory store key
	MemStoreKey = "mem_crosschain"
)

const (
	// BridgeTransferKeyPrefix is the prefix to retrieve all BridgeTransfer
	BridgeTransferKeyPrefix = "BridgeTransfer/value/"

	// BridgeStateKey is the key to retrieve the BridgeState
	BridgeStateKey = "BridgeState/value/"

	// ParamsKey is the key to retrieve the Params
	ParamsKey = "Params/value/"
)

// BridgeTransferKey returns the store key to retrieve a BridgeTransfer from the index fields
func BridgeTransferKey(transferId uint64) []byte {
	return append([]byte(BridgeTransferKeyPrefix), []byte(fmt.Sprintf("%d", transferId))...)
}

// GetBridgeTransferIDBytes returns the byte representation of the ID
func GetBridgeTransferIDBytes(id uint64) []byte {
	bz := make([]byte, 8)
	binary.BigEndian.PutUint64(bz, id)
	return bz
}

// GetBridgeTransferIDFromBytes returns ID in uint64 format from a byte array
func GetBridgeTransferIDFromBytes(bz []byte) uint64 {
	return binary.BigEndian.Uint64(bz)
}