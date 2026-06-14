package keeper

import (
	"context"

	"cosmossdk.io/collections"
	"marketplace/x/governance/types"
)

// InitGenesis initializes the governance module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState *types.GenesisState) error {
	// Set starting proposal ID
	if err := k.ProposalID.Set(ctx, genState.StartingProposalId); err != nil {
		return err
	}

	// Set params
	if err := k.SetParams(ctx, genState.Params); err != nil {
		return err
	}

	// Set constitution
	if genState.Constitution != "" {
		if err := k.SetConstitution(ctx, genState.Constitution); err != nil {
			return err
		}
	}

	// Set deposits
	for _, deposit := range genState.Deposits {
		if err := k.SetDeposit(ctx, deposit); err != nil {
			return err
		}
	}

	// Set votes
	for _, vote := range genState.Votes {
		if err := k.SetVote(ctx, vote); err != nil {
			return err
		}
	}

	// Set proposals
	for _, proposal := range genState.Proposals {
		if err := k.SetProposal(ctx, proposal); err != nil {
			return err
		}
	}

	return nil
}

// ExportGenesis returns the governance module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	// Get starting proposal ID
	startingProposalId, err := k.ProposalID.Peek(ctx)
	if err != nil {
		return nil, err
	}

	// Get params
	params, err := k.GetParams(ctx)
	if err != nil {
		return nil, err
	}

	// Get constitution
	constitution, err := k.GetConstitution(ctx)
	if err != nil {
		// Constitution might not be set, use empty string
		constitution = ""
	}

	// Get deposits
	var deposits []types.Deposit
	err = k.Deposits.Walk(ctx, nil, func(key collections.Pair[uint64, string], deposit types.Deposit) (bool, error) {
		deposits = append(deposits, deposit)
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	// Get votes
	var votes []types.Vote
	err = k.Votes.Walk(ctx, nil, func(key collections.Pair[uint64, string], vote types.Vote) (bool, error) {
		votes = append(votes, vote)
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	// Get proposals
	proposals, err := k.GetProposals(ctx)
	if err != nil {
		return nil, err
	}

	return &types.GenesisState{
		StartingProposalId: startingProposalId,
		Deposits:           deposits,
		Votes:              votes,
		Proposals:          proposals,
		Params:             params,
		Constitution:       constitution,
	}, nil
}
