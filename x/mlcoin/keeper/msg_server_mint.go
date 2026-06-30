package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	minttypes "github.com/cosmos/cosmos-sdk/x/mint/types"
)

func (k msgServer) MintMallcoin(ctx context.Context, msg *types.MsgMintMallcoin) (*types.MsgMintMallcoinResponse, error) {

	// Authority check: ensure the message authority matches keeper authority
	authStr, err := k.Keeper.addressCodec.BytesToString(k.Keeper.GetAuthority())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrUnauthorized, "invalid module authority")
	}
	if msg.Authority != authStr {
		return nil, errorsmod.Wrap(types.ErrUnauthorized, "unauthorized")
	}

	if msg.Amount == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "amount must be > 0")
	}

	// Mint tokens into the mint module account, then transfer to recipient
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	coins := sdk.NewCoins(sdk.NewInt64Coin("mlc", int64(msg.Amount)))
	if err := k.Keeper.bankKeeper.MintCoins(sdkCtx, minttypes.ModuleName, coins); err != nil {
		return nil, err
	}

	recipientAddr, err := sdk.AccAddressFromBech32(msg.Recipient)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "invalid recipient address")
	}
	if err := k.Keeper.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, minttypes.ModuleName, recipientAddr, coins); err != nil {
		return nil, err
	}

	// Record a transaction with unique ID
	txid, _ := k.Keeper.RecordTransaction(ctx, authStr, msg.Recipient, msg.Amount, "mint", "Authority mint")

	return &types.MsgMintMallcoinResponse{TxId: txid}, nil
}
