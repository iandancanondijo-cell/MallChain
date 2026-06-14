package keeper

import (
	"context"
	"time"

	"marketplace/x/mallpoints/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) ConvertToMallcoin(ctx context.Context, msg *types.MsgConvertToMallcoin) (*types.MsgConvertToMallcoinResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	// Check if user has a badge
	hasBadge := k.HasBadge(ctx, msg.Creator)

	// Validate conversion window based on badge status
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentTime := sdkCtx.BlockTime()
	dayOfMonth := currentTime.Day()
	monthOfYear := currentTime.Month()

	conversionAllowed := false

	if hasBadge {
		// Badge holders can convert on the 15th of every month
		conversionAllowed = dayOfMonth == 15
		if !conversionAllowed {
			return nil, errorsmod.Wrap(types.ErrConversionWindowClosed, "badge holders can only convert on the 15th of each month")
		}
	} else {
		// Non-badge holders can only convert on December 27th
		conversionAllowed = (monthOfYear == time.December) && (dayOfMonth == 27)
		if !conversionAllowed {
			return nil, errorsmod.Wrap(types.ErrConversionWindowClosed, "non-badge holders can only convert on December 27th of each year")
		}
	}

	// Get user's Mallpoints balance
	userPoints, err := k.Keeper.UserPoints.Get(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrUserNotFound, "user has no Mallpoints")
	}

	// Check if user has sufficient Mallpoints
	if userPoints.Points < msg.Amount {
		return nil, errorsmod.Wrap(types.ErrInsufficientPoints, "insufficient Mallpoints balance")
	}

	// Deduct Mallpoints
	userPoints.Points -= msg.Amount
	if err := k.Keeper.UserPoints.Set(ctx, msg.Creator, userPoints); err != nil {
		return nil, err
	}

	// Mint Mallcoins to user wallet via mlcoin keeper
	// Conversion rate: 1 Mallpoint = 1 Mallcoin (can be adjusted)
	err = k.MintToUser(ctx, msg.Creator, msg.Amount)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to mint Mallcoins")
	}

	return &types.MsgConvertToMallcoinResponse{}, nil
}
