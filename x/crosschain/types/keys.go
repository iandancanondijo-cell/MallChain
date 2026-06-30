package types

import (
	"encoding/binary"
	"fmt"
)

const (
	ModuleName = "crosschain"
	StoreKey   = ModuleName
	RouterKey  = ModuleName
	MemStoreKey = "mem_crosschain"
	GovModuleName = "gov"
)

const (
	BridgeTransferKeyPrefix = "BridgeTransfer/value/"
	BridgeStateKey        = "BridgeState/value/"
	ParamsKey             = "Params/value/"
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