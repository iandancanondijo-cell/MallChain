package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/collections"
	sdk "github.com/cosmos/cosmos-sdk/types"
	govkeeper "github.com/cosmos/cosmos-sdk/x/gov/keeper"
	types "marketplace/x/governance/types"
)

func (k Keeper) ExecuteTreasuryProposal(ctx context.Context, proposalId uint64, govKeeper *govkeeper.Keeper) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	proposal, err := k.GetProposal(ctx, proposalId)
	if err != nil {
		return err
	}

	if proposal.Status != types.StatusPassed && proposal.Status != types.StatusVotingPeriod {
		return fmt.Errorf("proposal %d is not in executable state (has %s)", proposalId, proposal.Status)
	}

	proposal.Status = types.StatusPassed
	if err := k.SetProposal(ctx, proposal); err != nil {
		return err
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"treasury_proposal_executed",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalId)),
		),
	)

	return nil
}

// CalculateStakeWeightedTally calculates voting power based on staked tokens.
func (k Keeper) CalculateStakeWeightedTally(ctx context.Context, proposalID uint64) (types.TallyResult, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return types.TallyResult{}, err
	}

	tally := types.EmptyTally()

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	err = k.Votes.Walk(ctx, nil, func(key collections.Pair[uint64, string], vote types.Vote) (bool, error) {
		voterAddr, err := sdk.AccAddressFromBech32(vote.Voter)
		if err != nil {
			return false, err
		}

		delegations, err := k.stakingKeeper.GetDelegatorDelegations(sdkCtx, voterAddr, 100)
		if err != nil {
			return false, err
		}

		for _, d := range delegations {
			stakeWeight := d.Shares.RoundInt()

			for _, option := range vote.Options {
				switch option.Option {
				case types.OptionYes:
					tally.YesCount = tally.YesCount.Add(stakeWeight)
				case types.OptionNo:
					tally.NoCount = tally.NoCount.Add(stakeWeight)
				case types.OptionNoWithVeto:
					tally.NoWithVetoCount = tally.NoWithVetoCount.Add(stakeWeight)
				case types.OptionAbstain:
					tally.AbstainCount = tally.AbstainCount.Add(stakeWeight)
				}
			}
		}
		return false, nil
	})

	if err != nil {
		return types.TallyResult{}, err
	}

	proposal.FinalTallyResult = tally
	if err := k.SetProposal(ctx, proposal); err != nil {
		return types.TallyResult{}, err
	}

	return tally, nil
}

// CheckProposalPassed checks if a proposal has passed based on tally results.
func (k Keeper) CheckProposalPassed(ctx context.Context, proposalID uint64) (bool, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return false, err
	}

	params, err := k.GetParams(ctx)
	if err != nil {
		return false, err
	}

	tally := proposal.FinalTallyResult
	totalVotes := tally.YesCount.Add(tally.NoCount).Add(tally.NoWithVetoCount).Add(tally.AbstainCount)

	if totalVotes.IsZero() {
		return false, nil
	}

	quorumThreshold := params.Quorum
	noWithVetoPower := tally.NoWithVetoCount.ToLegacyDec().Quo(totalVotes.ToLegacyDec())
	if noWithVetoPower.GT(quorumThreshold) {
		proposal.Status = types.StatusRejected
		_ = k.SetProposal(ctx, proposal)
		return false, nil
	}

	yesThreshold := params.Threshold
	yesPower := tally.YesCount.ToLegacyDec().Quo(totalVotes.ToLegacyDec())
	if yesPower.GTE(yesThreshold) {
		proposal.Status = types.StatusPassed
		_ = k.SetProposal(ctx, proposal)
		return true, nil
	}

	return false, nil
}