package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	errorsmod "cosmossdk.io/errors"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	mlcoinkeeper "marketplace/x/mlcoin/keeper"
	mlcointypes "marketplace/x/mlcoin/types"
	"marketplace/x/wasmbridge/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	mlcoinKeeper *mlcoinkeeper.Keeper

	Schema      collections.Schema
	BridgeState collections.Map[string, uint64]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	mlcoinKeeper *mlcoinkeeper.Keeper,
) Keeper {
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
		panic(err)
	}
	k.Schema = schema

	return k
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
	if err := k.validateAddress(msg.From); err != nil {
		return err
	}
	if err := k.validateAddress(msg.To); err != nil {
		return err
	}
	if msg.Amount == 0 {
		return errorsmod.Wrap(mlcointypes.ErrInvalidRequest, "transfer amount must be greater than zero")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	return k.mlcoinKeeper.Transfer(sdkCtx, msg.From, msg.To, msg.Amount)
}

func (k Keeper) HandleApprove(ctx context.Context, msg types.MGP20ApproveMsg) error {
	if err := k.validateAddress(msg.Owner); err != nil {
		return err
	}
	if err := k.validateAddress(msg.Spender); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	return k.mlcoinKeeper.Approve(sdkCtx, msg.Owner, msg.Spender, msg.Amount)
}

func (k Keeper) HandleTransferFrom(ctx context.Context, msg types.MGP20TransferFromMsg) error {
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

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	return k.mlcoinKeeper.TransferFrom(sdkCtx, msg.Owner, msg.Spender, msg.Recipient, msg.Amount)
}

func (k Keeper) QueryBalance(ctx context.Context, address string) (uint64, error) {
	if err := k.validateAddress(address); err != nil {
		return 0, err
	}

	wallet, err := k.mlcoinKeeper.WalletBalance.Get(ctx, address)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return 0, nil
		}
		return 0, errorsmod.Wrap(err, "failed to query balance")
	}

	return wallet.Balance, nil
}

func (k Keeper) QueryAllowance(ctx context.Context, owner, spender string) (uint64, error) {
	if err := k.validateAddress(owner); err != nil {
		return 0, err
	}
	if err := k.validateAddress(spender); err != nil {
		return 0, err
	}

	return k.mlcoinKeeper.GetAllowance(ctx, owner, spender)
}