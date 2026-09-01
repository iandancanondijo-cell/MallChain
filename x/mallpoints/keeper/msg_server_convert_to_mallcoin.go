package keeper

import (
	"context"
	"fmt"
	"math"
	"strconv"

	"marketplace/x/mallpoints/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// safeMulDiv computes (a * b) / c as uint64 with explicit overflow guard on
// the intermediate multiply. Used for ratio-scaled financial conversions
// where client and chain must produce byte-identical results.
func safeMulDiv(a, b, c uint64) (uint64, error) {
	if c == 0 {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "safeMulDiv: divisor is zero")
	}
	if b == 0 {
		return 0, nil
	}
	if a > math.MaxUint64/b {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "safeMulDiv: arithmetic overflow")
	}
	return (a * b) / c, nil
}

func (k msgServer) ConvertToMallcoin(ctx context.Context, msg *types.MsgConvertToMallcoin) (*types.MsgConvertToMallcoinResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	// C4: resolve the governance-authoritative conversion ratio from the
	// x/mlcoin keeper *before* doing any balance mutations so the ratio is
	// snapshotted at the top of the Msg and can't change mid-execution.
	// Same exact value is used on the backend (via /mlcoin/v1/params) so
	// client preview == on-chain settlement.
	ratioFixed, scale := k.mlcoinKeeper.GetConversionRatio(ctx)
	mintedAmount, err := safeMulDiv(msg.Amount, ratioFixed, scale)
	if err != nil {
		return nil, errorsmod.Wrap(err, "conversion ratio math")
	}
	if mintedAmount == 0 && msg.Amount > 0 {
		return nil, errorsmod.Wrapf(
			types.ErrInvalidRequest,
			"convert amount %d points rounds down to zero coins at ratio %d/%d; increase amount",
			msg.Amount, ratioFixed, scale,
		)
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

	// Deduct Mallpoints first (treasury double-spend guard).
	userPoints.Points -= msg.Amount
	if err := k.Keeper.UserPoints.Set(ctx, msg.Creator, userPoints); err != nil {
		return nil, err
	}

	// Mint the ratio-scaled amount of Mallcoins. Previously hardcoded 1:1
	// (C4 root cause); now derives from x/mlcoin Params.MlptsPerMlcns.
	err = k.MintToUser(ctx, msg.Creator, mintedAmount)
	if err != nil {
		return nil, errorsmod.Wrap(err, fmt.Sprintf("failed to mint %d Mallcoins", mintedAmount))
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeConvertPoints,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
		sdk.NewAttribute(types.AttributeKeyUser, msg.Creator),
		sdk.NewAttribute(types.AttributeKeyPoints, strconv.FormatUint(msg.Amount, 10)),
		// C4 fix: AttributeKeyAmount now holds the actual minted MLCNS,
		// not the input points count. Callers that need both amounts can
		// read the separate attributes.
		sdk.NewAttribute(types.AttributeKeyAmount, strconv.FormatUint(mintedAmount, 10)),
		sdk.NewAttribute("ratio_fixed", strconv.FormatUint(ratioFixed, 10)),
		sdk.NewAttribute("ratio_scale", strconv.FormatUint(scale, 10)),
	))

	return &types.MsgConvertToMallcoinResponse{}, nil
}
