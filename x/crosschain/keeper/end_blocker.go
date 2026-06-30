package keeper

import (
	"context"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/crosschain/types"
)

// EndBlocker enforces transfer timeouts and emits lifecycle events.
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	params, err := k.GetParams(sdk.UnwrapSDKContext(ctx))
	if err != nil {
		return err
	}
	timeoutBlocks := params.TransferTimeoutBlocks
	if timeoutBlocks == 0 {
		timeoutBlocks = 1000
	}

	err = k.BridgeTransfers.Walk(ctx, nil, func(id uint64, transfer types.BridgeTransfer) (bool, error) {
		if transfer.Status != "pending" {
			return false, nil
		}
		meta, metaErr := k.TransferMeta.Get(ctx, id)
		if metaErr != nil {
			return false, nil
		}
		if uint64(sdkCtx.BlockHeight()) <= meta.InitHeight+meta.TimeoutBlocks {
			return false, nil
		}
		if err := k.refundTimedOutTransfer(ctx, id, "timeout"); err != nil {
			sdkCtx.Logger().Error("failed to refund timed out bridge transfer", "transfer_id", id, "error", err)
		} else {
			k.emitBridgeEvent(sdkCtx, types.EventTypeBridgeTimedOut,
				sdk.NewAttribute(types.AttributeKeyTransferID, strconv.FormatUint(id, 10)),
				sdk.NewAttribute(types.AttributeKeyStatus, "timed_out"),
			)
		}
		return false, nil
	})
	return err
}
