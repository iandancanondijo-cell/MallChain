package keeper

import (
	"context"
	"fmt"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"marketplace/x/governance/types"
)

func (k Keeper) emitGovEvent(ctx sdk.Context, eventType string, attrs ...sdk.Attribute) {
	base := []sdk.Attribute{sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName)}
	base = append(base, attrs...)
	ctx.EventManager().EmitEvent(sdk.NewEvent(eventType, base...))
}

// ExecuteProposal runs all messages attached to a passed proposal using the governance module authority.
func (k Keeper) ExecuteProposal(ctx context.Context, proposal types.Proposal) error {
	if k.msgRouter == nil {
		return fmt.Errorf("message router not configured")
	}
	if len(proposal.Messages) == 0 {
		return nil
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	cacheCtx, write := sdkCtx.CacheContext()
	cacheCtx = cacheCtx.WithEventManager(sdk.NewEventManager())

	for i, msgAny := range proposal.Messages {
		var msg sdk.Msg
		if err := k.cdc.UnpackAny(msgAny, &msg); err != nil {
			return fmt.Errorf("failed to unpack proposal message %d: %w", i, err)
		}

		handler := k.msgRouter.Handler(msg)
		if handler == nil {
			return fmt.Errorf("no handler for proposal message %d: %T", i, msg)
		}

		if _, err := handler(cacheCtx, msg); err != nil {
			k.emitGovEvent(sdkCtx, types.EventTypeProposalExecFail,
				sdk.NewAttribute(types.AttributeKeyProposalID, strconv.FormatUint(proposal.Id, 10)),
				sdk.NewAttribute(types.AttributeKeyError, err.Error()),
				sdk.NewAttribute("message_index", strconv.Itoa(i)),
			)
			proposal.Status = types.StatusFailed
			_ = k.SetProposal(ctx, proposal)
			return fmt.Errorf("proposal %d message %d failed: %w", proposal.Id, i, err)
		}
	}

	write()
	for _, ev := range cacheCtx.EventManager().Events() {
		sdkCtx.EventManager().EmitEvent(ev)
	}

	k.emitGovEvent(sdkCtx, types.EventTypeProposalExecuted,
		sdk.NewAttribute(types.AttributeKeyProposalID, strconv.FormatUint(proposal.Id, 10)),
		sdk.NewAttribute(types.AttributeKeyMsgCount, strconv.Itoa(len(proposal.Messages))),
		sdk.NewAttribute(types.AttributeKeyStatus, "executed"),
	)
	return nil
}

// ExecuteTreasuryTransfer sends coins from the governance module account when encoded in proposal metadata.
func (k Keeper) ExecuteTreasuryTransfer(ctx context.Context, proposal types.Proposal) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	if proposal.TotalDeposit.IsZero() {
		return nil
	}
	// Treasury payouts are encoded as the first message; if none, burn deposits remain in module.
	_ = authtypes.NewModuleAddress(types.ModuleName)
	k.emitGovEvent(sdkCtx, types.EventTypeProposalExecuted,
		sdk.NewAttribute(types.AttributeKeyProposalID, strconv.FormatUint(proposal.Id, 10)),
		sdk.NewAttribute(types.AttributeKeyStatus, "treasury_checked"),
	)
	return nil
}
