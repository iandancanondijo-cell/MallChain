package keeper

import (
	"context"
	"errors"
	"fmt"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"

	"marketplace/x/crosschain/types"
)

// InitiateBridgeTransfer initiates a new cross-chain bridge transfer
func (k Keeper) InitiateBridgeTransfer(ctx sdk.Context, msg *types.MsgInitiateBridgeTransfer) (uint64, error) {
	params, err := k.GetParams(ctx)
	if err != nil {
		return 0, err
	}

	// Validate destination chain
	if err := k.validateDestinationChain(params, msg.DestinationChain); err != nil {
		return 0, err
	}

	// Validate transfer amount (compare numeric values)
	if err := k.validateTransferAmount(params, msg.Amount); err != nil {
		return 0, err
	}

	senderAddr, err := sdk.AccAddressFromBech32(msg.Sender)
	if err != nil {
		return 0, err
	}

	coins := sdk.NewCoins(msg.Amount)
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, senderAddr, types.ModuleName, coins); err != nil {
		return 0, err
	}

	// Get bridge state
	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		bridgeState = types.BridgeState{}
	}

	// Create new transfer
	transferId := bridgeState.NextTransferId
	amount := msg.Amount // Make a copy
	transfer := types.BridgeTransfer{
		Id:               transferId,
		Sender:           msg.Sender,
		Recipient:        msg.Recipient,
		Amount:           &amount,
		SourceChain:      "marketplace",
		DestinationChain: msg.DestinationChain,
		AssetDenom:       msg.Amount.Denom,
		Status:           "pending",
		Timestamp:        uint64(ctx.BlockTime().Unix()),
	}

	// Store transfer
	if err := k.BridgeTransfers.Set(ctx, transferId, transfer); err != nil {
		return 0, err
	}

	// Update bridge state
	bridgeState.NextTransferId++
	// Store a copy to avoid pointer to local variable
	transferCopy := transfer
	bridgeState.PendingTransfers = append(bridgeState.PendingTransfers, &transferCopy)

	if err := k.BridgeState.Set(ctx, bridgeState); err != nil {
		return 0, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	route, routeErr := k.GetChainRoute(ctx, msg.DestinationChain)
	if routeErr == nil && route.ChannelID != "" {
		if err := k.sendOutboundIBCTransfer(sdkCtx, transfer, transferId, route); err != nil {
			if refundErr := k.refundTimedOutTransfer(ctx, transferId, "refund"); refundErr != nil {
				return 0, fmt.Errorf("ibc transfer failed: %w; refund failed: %v", err, refundErr)
			}
			return 0, err
		}
	} else {
		k.emitBridgeEvent(sdkCtx, types.EventTypeBridgeInitiated,
			sdk.NewAttribute(types.AttributeKeyTransferID, fmt.Sprintf("%d", transferId)),
			sdk.NewAttribute(types.AttributeKeySender, msg.Sender),
			sdk.NewAttribute(types.AttributeKeyRecipient, msg.Recipient),
			sdk.NewAttribute(types.AttributeKeyAmount, msg.Amount.String()),
			sdk.NewAttribute(types.AttributeKeyDestChain, msg.DestinationChain),
			sdk.NewAttribute(types.AttributeKeyStatus, "pending_local"),
		)
	}

	return transferId, nil
}

// CompleteBridgeTransfer completes a cross-chain bridge transfer
func (k Keeper) CompleteBridgeTransfer(ctx sdk.Context, msg *types.MsgCompleteBridgeTransfer) error {
	// Get transfer
	transfer, err := k.BridgeTransfers.Get(ctx, msg.TransferId)
	if err != nil {
		return types.ErrTransferNotFound
	}

	if transfer.Status != "pending" {
		return types.ErrTransferAlreadyCompleted
	}

	// Check for transfer timeout
	if err := k.checkTransferTimeout(ctx, msg.TransferId); err != nil {
		return err
	}

	// Require a proof for transfer completion
	if err := k.verifyTransferProof(ctx, msg.Proof, transfer); err != nil {
		return err
	}

	// Require a currently bonded, non-jailed validator to complete the transfer.
	if err := k.validateBondedValidator(ctx, msg.Validator); err != nil {
		return err
	}

	// Ensure module has sufficient balance (prevent unbacked minting)
	if err := k.validateModuleBalance(ctx, transfer); err != nil {
		return err
	}

	recipientAddr, err := sdk.AccAddressFromBech32(transfer.Recipient)
	if err != nil {
		return err
	}

	coins := sdk.NewCoins(*transfer.Amount)
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, recipientAddr, coins); err != nil {
		return err
	}

	// Update transfer status
	transfer.Status = "completed"
	if err := k.BridgeTransfers.Set(ctx, msg.TransferId, transfer); err != nil {
		return err
	}

	if err := k.moveTransferToCompleted(ctx, msg.TransferId, transfer); err != nil {
		return err
	}
	_ = k.TransferMeta.Remove(ctx, msg.TransferId)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	k.emitBridgeEvent(sdkCtx, types.EventTypeBridgeCompleted,
		sdk.NewAttribute(types.AttributeKeyTransferID, fmt.Sprintf("%d", msg.TransferId)),
		sdk.NewAttribute(types.AttributeKeyRecipient, transfer.Recipient),
		sdk.NewAttribute(types.AttributeKeyAmount, transfer.Amount.String()),
		sdk.NewAttribute(types.AttributeKeyProof, msg.Proof),
		sdk.NewAttribute(types.AttributeKeyStatus, "completed"),
	)

	return nil
}

// validateDestinationChain checks if the destination chain is supported
func (k Keeper) validateDestinationChain(params types.Params, destinationChain string) error {
	for _, chain := range params.SupportedChains {
		if chain == destinationChain {
			return nil
		}
	}
	return types.ErrInvalidChain
}

// validateTransferAmount checks if the transfer amount is within bounds
func (k Keeper) validateTransferAmount(params types.Params, amount sdk.Coin) error {
	if amount.Amount.LT(math.NewIntFromUint64(params.MinTransferAmount)) || amount.Amount.GT(math.NewIntFromUint64(params.MaxTransferAmount)) {
		return types.ErrInvalidAmount
	}
	return nil
}

// checkTransferTimeout validates that a transfer hasn't expired
func (k Keeper) checkTransferTimeout(ctx sdk.Context, transferID uint64) error {
	meta, metaErr := k.TransferMeta.Get(ctx, transferID)
	if metaErr == nil {
		// Transfer has timeout metadata - check if it has expired
		if uint64(ctx.BlockHeight()) > meta.InitHeight+meta.TimeoutBlocks {
			return types.ErrTransferTimeout
		}
	}
	return nil
}

// validateModuleBalance ensures the module has sufficient balance for the transfer
func (k Keeper) validateModuleBalance(ctx sdk.Context, transfer types.BridgeTransfer) error {
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)
	moduleCoins := k.bankKeeper.SpendableCoins(ctx, moduleAddr)
	if transfer.Amount == nil {
		return types.ErrInvalidAmount
	}
	if !moduleCoins.IsAllGTE(sdk.NewCoins(*transfer.Amount)) {
		return types.ErrInsufficientModuleBalance
	}
	return nil
}

// validateBondedValidator authorizes any currently bonded, non-jailed validator to complete a transfer.
func (k Keeper) validateBondedValidator(ctx context.Context, validator string) error {
	if validator == "" || k.stakingKeeper == nil {
		return types.ErrUnauthorized
	}

	if valAddr, err := sdk.ValAddressFromBech32(validator); err == nil {
		validatorRecord, err := k.stakingKeeper.GetValidator(ctx, valAddr)
		if err != nil {
			if errors.Is(err, stakingtypes.ErrNoValidatorFound) {
				return types.ErrUnauthorized
			}
			return err
		}
		if validatorRecord.IsBonded() && !validatorRecord.Jailed {
			return nil
		}
		return types.ErrUnauthorized
	}

	consAddr, err := sdk.ConsAddressFromBech32(validator)
	if err != nil {
		return types.ErrUnauthorized
	}

	validatorRecord, err := k.stakingKeeper.GetValidatorByConsAddr(ctx, consAddr)
	if err != nil {
		if errors.Is(err, stakingtypes.ErrNoValidatorFound) {
			return types.ErrUnauthorized
		}
		return err
	}
	if validatorRecord.IsBonded() && !validatorRecord.Jailed {
		return nil
	}
	return types.ErrUnauthorized
}

func (k Keeper) PruneOldTransfers(ctx context.Context, maxToKeep uint64) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	state, err := k.GetBridgeState(sdkCtx)
	if err != nil {
		return 0, err
	}

	completed := state.CompletedTransfers
	if uint64(len(completed)) <= maxToKeep {
		return 0, nil
	}

	pruneCount := uint64(len(completed)) - maxToKeep
	state.CompletedTransfers = completed[pruneCount:]

	if err := k.SetBridgeState(sdkCtx, state); err != nil {
		return 0, err
	}

	return pruneCount, nil
}
