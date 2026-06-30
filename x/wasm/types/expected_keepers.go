package types

import (
	"context"

	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

// WasmBridgeKeeper defines the expected interface for the wasm bridge module.
type WasmBridgeKeeper interface {
	HandleTransfer(ctx context.Context, msg wasmbridgetypes.MGP20TransferMsg) error
	HandleApprove(ctx context.Context, msg wasmbridgetypes.MGP20ApproveMsg) error
	QueryBalance(ctx context.Context, address string) (uint64, error)
}
