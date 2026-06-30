package keeper

import (
	"context"
	"fmt"
	"strconv"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/governance/types"
)

// EndBlocker processes governance logic at the end of each block.
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentTime := sdkCtx.BlockTime()

	// Process all proposals
	proposals, err := k.GetProposals(ctx)
	if err != nil {
		return err
	}

	for _, proposal := range proposals {
		switch proposal.Status {
		case types.StatusDepositPeriod:
			if currentTime.After(proposal.DepositEndTime) {
				if err := k.processDepositPeriodEnd(ctx, proposal); err != nil {
					return err
				}
			}

		case types.StatusVotingPeriod:
			if currentTime.After(proposal.VotingEndTime) {
				if err := k.processVotingPeriodEnd(ctx, proposal); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

// processDepositPeriodEnd handles the end of a proposal's deposit period.
func (k Keeper) processDepositPeriodEnd(ctx context.Context, proposal types.Proposal) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	params, err := k.GetParams(ctx)
	if err != nil {
		return err
	}

	if proposal.TotalDeposit.IsAllGTE(params.MinDeposit) {
		proposal.Status = types.StatusVotingPeriod
		proposal.VotingStartTime = sdkCtx.BlockTime()
		proposal.VotingEndTime = proposal.VotingStartTime.Add(params.VotingPeriod)
	} else {
		// Proposal failed to reach minimum deposit - refund all deposits
		proposal.Status = types.StatusFailed
		if err := k.refundDeposits(ctx, proposal.Id); err != nil {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				types.EventTypeDepositRefundFail,
				sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposal.Id)),
				sdk.NewAttribute("error", err.Error()),
			))
		}
	}

	return k.SetProposal(ctx, proposal)
}

// processVotingPeriodEnd handles the end of a proposal's voting period.
func (k Keeper) processVotingPeriodEnd(ctx context.Context, proposal types.Proposal) error {
	tally, err := k.TallyVotes(ctx, proposal.Id)
	if err != nil {
		return err
	}

	params, err := k.GetParams(ctx)
	if err != nil {
		return err
	}

	outcome := k.determineProposalOutcome(ctx, tally, params)
	proposal.Status = outcome
	proposal.FinalTallyResult = tally

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if outcome == types.StatusPassed {
		k.emitGovEvent(sdkCtx, types.EventTypeProposalPassed,
			sdk.NewAttribute(types.AttributeKeyProposalID, strconv.FormatUint(proposal.Id, 10)),
			sdk.NewAttribute(types.AttributeKeyStatus, "passed"),
		)
		if err := k.ExecuteProposal(ctx, proposal); err != nil {
			sdkCtx.Logger().Error("proposal execution failed", "proposal_id", proposal.Id, "error", err)
		} else if err := k.ExecuteTreasuryTransfer(ctx, proposal); err != nil {
			sdkCtx.Logger().Error("treasury execution failed", "proposal_id", proposal.Id, "error", err)
		}
	} else if outcome == types.StatusRejected {
		k.emitGovEvent(sdkCtx, types.EventTypeProposalRejected,
			sdk.NewAttribute(types.AttributeKeyProposalID, strconv.FormatUint(proposal.Id, 10)),
			sdk.NewAttribute(types.AttributeKeyStatus, "rejected"),
		)
	}

	// Refund deposits if proposal was rejected
	if outcome == types.StatusRejected {
		if err := k.refundDeposits(ctx, proposal.Id); err != nil {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				types.EventTypeDepositRefundFail,
				sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposal.Id)),
				sdk.NewAttribute("error", err.Error()),
			))
		}
	}

	return k.SetProposal(ctx, proposal)
}

func (k Keeper) determineProposalOutcome(ctx context.Context, tally types.TallyResult, params types.Params) types.ProposalStatus {
	totalVotes := tally.YesCount.Add(tally.NoCount).Add(tally.NoWithVetoCount).Add(tally.AbstainCount)

	if totalVotes.IsZero() {
		return types.StatusRejected
	}

	vetoRatio := math.LegacyNewDecFromInt(tally.NoWithVetoCount).Quo(math.LegacyNewDecFromInt(totalVotes))
	if vetoRatio.GT(params.VetoThreshold) {
		return types.StatusRejected
	}

	if !k.hasQuorum(ctx, tally, params) {
		return types.StatusRejected
	}

	yesRatio := math.LegacyNewDecFromInt(tally.YesCount).Quo(math.LegacyNewDecFromInt(totalVotes))
	if yesRatio.GT(params.Threshold) {
		return types.StatusPassed
	}

	return types.StatusRejected
}

func (k Keeper) hasQuorum(ctx context.Context, tally types.TallyResult, params types.Params) bool {
	totalVotes := tally.YesCount.Add(tally.NoCount).Add(tally.NoWithVetoCount).Add(tally.AbstainCount)
	if totalVotes.IsZero() {
		return false
	}

	if k.stakingKeeper == nil {
		return false
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	totalBonded, err := k.stakingKeeper.TotalBondedTokens(sdkCtx)
	if err != nil {
		return false
	}
	if totalBonded.IsZero() {
		return true
	}

	quorumRatio := math.LegacyNewDecFromInt(totalVotes).Quo(math.LegacyNewDecFromInt(totalBonded))
	return quorumRatio.GTE(params.Quorum)
}

// refundDeposits returns all deposits for a proposal back to their depositors.
// Returns an error describing the first failure (if any), but always attempts
// every depositor so a single failure doesn't block remaining refunds.
func (k Keeper) refundDeposits(ctx context.Context, proposalID uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	deposits, err := k.GetDeposits(ctx, proposalID)
	if err != nil {
		return err
	}

	var firstErr error
	for _, deposit := range deposits {
		depositorAddr, err := k.addressCodec.StringToBytes(deposit.Depositor)
		if err != nil {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				"deposit_refund_failed",
				sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
				sdk.NewAttribute("depositor", deposit.Depositor),
				sdk.NewAttribute("error", err.Error()),
			))
			if firstErr == nil {
				firstErr = fmt.Errorf("failed to decode depositor %s: %w", deposit.Depositor, err)
			}
			continue
		}

		// Send coins from governance module back to depositor
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(
			sdkCtx,
			types.ModuleName,
			depositorAddr,
			deposit.Amount,
		); err != nil {
			sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
				"deposit_refund_failed",
				sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
				sdk.NewAttribute("depositor", deposit.Depositor),
				sdk.NewAttribute("amount", deposit.Amount.String()),
				sdk.NewAttribute("error", err.Error()),
			))
			if firstErr == nil {
				firstErr = fmt.Errorf("failed to refund depositor %s: %w", deposit.Depositor, err)
			}
			continue
		}

		sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
			types.EventTypeDepositRefunded,
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("depositor", deposit.Depositor),
			sdk.NewAttribute("amount", deposit.Amount.String()),
		))
	}

	return firstErr
}
