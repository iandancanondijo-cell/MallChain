package keeper

import (
	"context"

	"marketplace/x/badge/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) IssueBadge(ctx context.Context, msg *types.MsgIssueBadge) (*types.MsgIssueBadgeResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	if _, err := k.addressCodec.StringToBytes(msg.Recipient); err != nil {
		return nil, errorsmod.Wrap(err, "invalid recipient address")
	}

	// Unlike the module's `authority` (defaults to the gov module account —
	// no private key, so only reachable via a governance vote), badge_issuer
	// is a regular operator address configured via governance-gated
	// MsgUpdateParams, meant for routine automated issuance. Without this
	// check, `creator` only needed to be a well-formed address — anyone
	// could self-issue themselves a badge for free.
	params, err := k.Keeper.Params.Get(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load params")
	}
	if params.BadgeIssuer == "" || msg.Creator != params.BadgeIssuer {
		return nil, errorsmod.Wrapf(types.ErrUnauthorizedIssuer, "creator %s is not the configured badge issuer", msg.Creator)
	}

	// Check if user already has a badge
	existingBadge, err := k.Keeper.UserBadge.Get(ctx, msg.Recipient)
	if err == nil && existingBadge.HasBadge {
		return nil, errorsmod.Wrap(types.ErrBadgeAlreadyIssued, "user already has a badge")
	}

	// Issue the badge with current block time
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	badge := types.UserBadge{
		Address:    msg.Recipient,
		HasBadge:   true,
		IssuedDate: uint64(sdkCtx.BlockTime().Unix()),
		BadgeType:  msg.BadgeType,
	}

	if err := k.Keeper.UserBadge.Set(ctx, msg.Recipient, badge); err != nil {
		return nil, err
	}

	return &types.MsgIssueBadgeResponse{}, nil
}
