package keeper

import (
	"context"
	"strconv"

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

	// Validate conversion window based on badge status and module params
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentTime := sdkCtx.BlockTime()
	dayOfMonth := currentTime.Day()
	monthOfYear := currentTime.Month()

	intervals, err := k.Keeper.GetModuleIntervals(ctx)
	if err != nil {
		return nil, err
	}

	conversionAllowed := false

	if hasBadge {
		conversionAllowed = uint64(dayOfMonth) == intervals.BadgeConversionDay
		if !conversionAllowed {
			return nil, errorsmod.Wrap(types.ErrConversionWindowClosed, "badge holders can only convert on configured conversion day")
		}
	} else {
		conversionAllowed = (uint64(monthOfYear) == intervals.NonBadgeConversionMon) && (uint64(dayOfMonth) == intervals.NonBadgeConversionDay)
		if !conversionAllowed {
			return nil, errorsmod.Wrap(types.ErrConversionWindowClosed, "non-badge holders can only convert on configured annual conversion date")
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

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeConvertPoints,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
		sdk.NewAttribute(types.AttributeKeyUser, msg.Creator),
		sdk.NewAttribute(types.AttributeKeyPoints, strconv.FormatUint(msg.Amount, 10)),
		sdk.NewAttribute(types.AttributeKeyAmount, strconv.FormatUint(msg.Amount, 10)),
	))

	return &types.MsgConvertToMallcoinResponse{}, nil
}
