package keeper

import (
	"context"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"marketplace/x/mlcoin/types"
)

// MintModuleCoins mints `amount` of mlc into the specified module account.
func (k Keeper) MintModuleCoins(ctx context.Context, moduleName string, amount uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	coins := sdk.NewCoins(sdk.NewInt64Coin("mlc", int64(amount)))
	if err := k.bankKeeper.MintCoins(sdkCtx, moduleName, coins); err != nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, err.Error())
	}
	return nil
}

// SendFromModuleToAccount sends `amount` of mlc from a module account to the recipient address.
func (k Keeper) SendFromModuleToAccount(ctx context.Context, moduleName string, recipient string, amount uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	acct, err := sdk.AccAddressFromBech32(recipient)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, "invalid recipient address")
	}
	coins := sdk.NewCoins(sdk.NewInt64Coin("mlc", int64(amount)))
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, moduleName, acct, coins); err != nil {
		return errorsmod.Wrap(types.ErrInvalidRequest, err.Error())
	}
	return nil
}
