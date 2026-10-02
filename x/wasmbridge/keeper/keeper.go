package keeper

import (
	"context"
	"strconv"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	errorsmod "cosmossdk.io/errors"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	mlcointypes "marketplace/x/mlcoin/types"
	"marketplace/x/wasmbridge/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	mlcoinKeeper types.MlcoinKeeper

	Schema      collections.Schema
	BridgeState collections.Map[string, uint64]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	mlcoinKeeper types.MlcoinKeeper,
) (Keeper, error) {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		mlcoinKeeper: mlcoinKeeper,
		BridgeState:  collections.NewMap(sb, types.BridgeStateKey, "bridgeState", collections.StringKey, collections.Uint64Value),
	}

	schema, err := sb.Build()
	if err != nil {
		return Keeper{}, err
	}
	k.Schema = schema

	return k, nil
}

func (k Keeper) validateAddress(address string) error {
	if address == "" {
		return errorsmod.Wrap(mlcointypes.ErrInvalidRequest, "address is required")
	}
	if _, err := k.addressCodec.StringToBytes(address); err != nil {
		return errorsmod.Wrap(err, "invalid address")
	}
	return nil
}

func (k Keeper) HandleTransfer(ctx context.Context, msg types.MGP20TransferMsg) error {
	if k.mlcoinKeeper == nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, "mlcoin keeper not initialized")
	}
	if err := k.validateAddress(msg.From); err != nil {
		return err
	}
	if err := k.validateAddress(msg.To); err != nil {
		return err
	}
	if msg.Amount == 0 {
		return errorsmod.Wrap(mlcointypes.ErrInvalidRequest, "transfer amount must be greater than zero")
	}

	if err := k.mlcoinKeeper.Transfer(ctx, msg.From, msg.To, msg.Amount); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeTransfer,
			sdk.NewAttribute("from", msg.From),
			sdk.NewAttribute("to", msg.To),
			sdk.NewAttribute("amount", strconv.FormatUint(msg.Amount, 10)),
		),
	)

	return nil
}

func (k Keeper) HandleApprove(ctx context.Context, msg types.MGP20ApproveMsg) error {
	if k.mlcoinKeeper == nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, "mlcoin keeper not initialized")
	}
	if err := k.validateAddress(msg.Owner); err != nil {
		return err
	}
	if err := k.validateAddress(msg.Spender); err != nil {
		return err
	}
	if msg.Amount == 0 {
		return errorsmod.Wrap(mlcointypes.ErrInvalidRequest, "approve amount must be greater than zero")
	}

	if err := k.mlcoinKeeper.Approve(ctx, msg.Owner, msg.Spender, msg.Amount); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeApprove,
			sdk.NewAttribute("owner", msg.Owner),
			sdk.NewAttribute("spender", msg.Spender),
			sdk.NewAttribute("amount", strconv.FormatUint(msg.Amount, 10)),
		),
	)

	return nil
}

func (k Keeper) HandleTransferFrom(ctx context.Context, msg types.MGP20TransferFromMsg) error {
	if k.mlcoinKeeper == nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, "mlcoin keeper not initialized")
	}
	if err := k.validateAddress(msg.Owner); err != nil {
		return err
	}
	if err := k.validateAddress(msg.Spender); err != nil {
		return err
	}
	if err := k.validateAddress(msg.Recipient); err != nil {
		return err
	}
	if msg.Amount == 0 {
		return errorsmod.Wrap(mlcointypes.ErrInvalidRequest, "transfer amount must be greater than zero")
	}

	_, err := k.mlcoinKeeper.TransferFrom(ctx, msg.Owner, msg.Spender, msg.Recipient, msg.Amount)
	if err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeTransferFrom,
			sdk.NewAttribute("owner", msg.Owner),
			sdk.NewAttribute("spender", msg.Spender),
			sdk.NewAttribute("recipient", msg.Recipient),
			sdk.NewAttribute("amount", strconv.FormatUint(msg.Amount, 10)),
		),
	)

	return nil
}

func (k Keeper) QueryBalance(ctx context.Context, address string) (uint64, error) {
	if k.mlcoinKeeper == nil {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "mlcoin keeper not initialized")
	}
	if err := k.validateAddress(address); err != nil {
		return 0, err
	}

	return k.mlcoinKeeper.GetBalance(ctx, address)
}

func (k Keeper) QueryAllowance(ctx context.Context, owner, spender string) (uint64, error) {
	if k.mlcoinKeeper == nil {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "mlcoin keeper not initialized")
	}
	if err := k.validateAddress(owner); err != nil {
		return 0, err
	}
	if err := k.validateAddress(spender); err != nil {
		return 0, err
	}

	allowance, err := k.mlcoinKeeper.GetAllowance(ctx, owner, spender)
	if err != nil {
		return 0, errorsmod.Wrap(err, "failed to query allowance")
	}

	return allowance, nil
}
