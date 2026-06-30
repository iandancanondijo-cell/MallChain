package keeper

import (
	"context"
	"fmt"
	"time"

	"cosmossdk.io/collections"
	cosmossdkerrors "cosmossdk.io/errors"
	"cosmossdk.io/math"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/marketplace/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	bankKeeper   types.BankKeeper

	Schema  collections.Schema
	Escrows collections.Map[string, types.Escrow]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	bankKeeper types.BankKeeper,
) Keeper {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		bankKeeper:   bankKeeper,
		Escrows:      collections.NewMap(sb, []byte(types.EscrowStateKey), "escrows", collections.StringKey, codec.CollValue[types.Escrow](cdc)),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// CreateEscrow creates a new escrow and locks funds from buyer
func (k Keeper) CreateEscrow(sdkCtx sdk.Context, buyer, seller, amount, denom, description string, disputeWindowSeconds uint64) (string, error) {
	amountInt, ok := math.NewIntFromString(amount)
	if !ok {
		return "", cosmossdkerrors.Wrap(types.ErrInvalidAmount, "invalid amount format")
	}

	if amountInt.IsNegative() || amountInt.IsZero() {
		return "", cosmossdkerrors.Wrap(types.ErrInvalidAmount, "amount must be positive")
	}

	buyerAddr, err := sdk.AccAddressFromBech32(buyer)
	if err != nil {
		return "", cosmossdkerrors.Wrap(types.ErrInvalidAmount, "invalid buyer address")
	}

	_, err = sdk.AccAddressFromBech32(seller)
	if err != nil {
		return "", cosmossdkerrors.Wrap(types.ErrInvalidAmount, "invalid seller address")
	}

	coins := sdk.NewCoins(sdk.NewCoin(denom, amountInt))

	// Transfer funds from buyer to module account
	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, buyerAddr, types.ModuleName, coins); err != nil {
		return "", cosmossdkerrors.Wrap(types.ErrInsufficientBalance, err.Error())
	}

	escrow := types.Escrow{
		Buyer:         buyer,
		Seller:        seller,
		Amount:        amount,
		Denom:         denom,
		Description:   description,
		Status:        types.StatusHeld,
		LockedFunds:   amount,
		CreatedAt:     sdkCtx.BlockTime().Unix(),
		ReleaseTime:   0,
		DisputeWindow: int64(disputeWindowSeconds),
	}

	// Generate unique escrow ID
	escrowID := fmt.Sprintf("%s-%d", buyer, sdkCtx.BlockTime().UnixNano())
	escrow.ID = escrowID

	if err := k.Escrows.Set(sdkCtx, escrowID, escrow); err != nil {
		// Refund if escrow creation fails
		_ = k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, buyerAddr, coins)
		return "", err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			"escrow_created",
			sdk.NewAttribute("escrow_id", escrowID),
			sdk.NewAttribute("buyer", buyer),
			sdk.NewAttribute("seller", seller),
			sdk.NewAttribute("amount", amount),
			sdk.NewAttribute("denom", denom),
		),
	})

	return escrowID, nil
}

// ReleaseFunds releases escrow funds to seller after optional dispute window
func (k Keeper) ReleaseFunds(sdkCtx sdk.Context, escrowID string, releaseBy string) error {
	escrow, err := k.Escrows.Get(sdkCtx, escrowID)
	if err != nil {
		return cosmossdkerrors.Wrap(types.ErrEscrowNotFound, fmt.Sprintf("escrow %s not found", escrowID))
	}

	if escrow.Status != types.StatusHeld && escrow.Status != types.StatusDisputed {
		return cosmossdkerrors.Wrap(types.ErrInvalidStatus, "escrow not in releasable state")
	}

	if escrow.Status == types.StatusReleased || escrow.Status == types.StatusRefunded {
		return cosmossdkerrors.Wrap(types.ErrAlreadyResolved, "escrow already resolved")
	}

	// If there was a dispute, check if dispute window has passed
	if escrow.Status == types.StatusDisputed {
		if escrow.ReleaseTime > 0 && sdkCtx.BlockTime().Unix() < escrow.ReleaseTime {
			return cosmossdkerrors.Wrap(types.ErrDisputePeriodPassed, "dispute resolution period not yet elapsed")
		}
	}

	escrow.Status = types.StatusReleased
	if err := k.Escrows.Set(sdkCtx, escrowID, escrow); err != nil {
		return err
	}

	amountInt, _ := math.NewIntFromString(escrow.Amount)
	coins := sdk.NewCoins(sdk.NewCoin(escrow.Denom, amountInt))

	sellerAddr, err := sdk.AccAddressFromBech32(escrow.Seller)
	if err != nil {
		return err
	}

	// Release funds to seller
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, sellerAddr, coins); err != nil {
		// Rollback status on failure
		escrow.Status = types.StatusHeld
		_ = k.Escrows.Set(sdkCtx, escrowID, escrow)
		return err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			"escrow_released",
			sdk.NewAttribute("escrow_id", escrowID),
			sdk.NewAttribute("seller", escrow.Seller),
			sdk.NewAttribute("amount", escrow.Amount),
		),
	})

	return nil
}

// RefundBuyer refunds escrow funds back to buyer
func (k Keeper) RefundBuyer(sdkCtx sdk.Context, escrowID string) error {
	escrow, err := k.Escrows.Get(sdkCtx, escrowID)
	if err != nil {
		return cosmossdkerrors.Wrap(types.ErrEscrowNotFound, fmt.Sprintf("escrow %s not found", escrowID))
	}

	// Allow refund in any state except released/refunded
	if escrow.Status == types.StatusReleased || escrow.Status == types.StatusRefunded {
		return cosmossdkerrors.Wrap(types.ErrAlreadyResolved, "escrow already resolved")
	}

	escrow.Status = types.StatusRefunded
	if err := k.Escrows.Set(sdkCtx, escrowID, escrow); err != nil {
		return err
	}

	amountInt, _ := math.NewIntFromString(escrow.Amount)
	coins := sdk.NewCoins(sdk.NewCoin(escrow.Denom, amountInt))

	buyerAddr, err := sdk.AccAddressFromBech32(escrow.Buyer)
	if err != nil {
		return err
	}

	// Refund funds to buyer
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, buyerAddr, coins); err != nil {
		// Rollback status on failure
		escrow.Status = types.StatusHeld
		_ = k.Escrows.Set(sdkCtx, escrowID, escrow)
		return err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			"escrow_refunded",
			sdk.NewAttribute("escrow_id", escrowID),
			sdk.NewAttribute("buyer", escrow.Buyer),
			sdk.NewAttribute("amount", escrow.Amount),
		),
	})

	return nil
}

// OpenDispute opens a dispute on an escrow, starting the dispute window
func (k Keeper) OpenDispute(sdkCtx sdk.Context, escrowID string, opener string) error {
	escrow, err := k.Escrows.Get(sdkCtx, escrowID)
	if err != nil {
		return cosmossdkerrors.Wrap(types.ErrEscrowNotFound, fmt.Sprintf("escrow %s not found", escrowID))
	}

	// Only buyer can dispute (they haven't received goods/services)
	if opener != escrow.Buyer {
		return cosmossdkerrors.Wrap(types.ErrUnauthorized, "only buyer can open dispute")
	}

	if escrow.Status != types.StatusHeld {
		return cosmossdkerrors.Wrap(types.ErrInvalidStatus, "escrow not in held state")
	}

	escrow.Status = types.StatusDisputed
	// Set release time to current time + dispute window
	escrow.ReleaseTime = sdkCtx.BlockTime().Add(time.Duration(escrow.DisputeWindow) * time.Second).Unix()

	if err := k.Escrows.Set(sdkCtx, escrowID, escrow); err != nil {
		return err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			"escrow_disputed",
			sdk.NewAttribute("escrow_id", escrowID),
			sdk.NewAttribute("opener", opener),
			sdk.NewAttribute("resolution_time", fmt.Sprintf("%d", escrow.ReleaseTime)),
		),
	})

	return nil
}

// GetEscrow returns escrow details
func (k Keeper) GetEscrow(sdkCtx sdk.Context, escrowID string) (types.Escrow, error) {
	escrow, err := k.Escrows.Get(sdkCtx, escrowID)
	return escrow, err
}

// GetAllEscrows returns all escrows (for query server)
func (k Keeper) GetAllEscrows(sdkCtx sdk.Context) ([]types.Escrow, error) {
	var escrows []types.Escrow
	err := k.Escrows.Walk(sdkCtx, nil, func(key string, escrow types.Escrow) (bool, error) {
		escrows = append(escrows, escrow)
		return false, nil
	})
	return escrows, err
}

func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	return nil
}

func (k Keeper) ExportGenesis(ctx context.Context) (types.GenesisState, error) {
	return types.GenesisState{}, nil
}