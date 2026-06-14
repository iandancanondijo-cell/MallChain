package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"

	"marketplace/x/governance/types"
)

// Keeper defines the governance module Keeper.
type Keeper struct {
	storeService  corestore.KVStoreService
	cdc           codec.Codec
	addressCodec  address.Codec
	bankKeeper    bankkeeper.Keeper
	stakingKeeper *stakingkeeper.Keeper

	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	// Collections
	Schema       collections.Schema
	Proposals    collections.Map[uint64, types.Proposal]
	Votes        collections.Map[collections.Pair[uint64, string], types.Vote]
	Deposits     collections.Map[collections.Pair[uint64, string], types.Deposit]
	Params       collections.Item[types.Params]
	Constitution collections.Item[string]
	ProposalID   collections.Sequence
}

// NewKeeper returns a new governance keeper.
func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper bankkeeper.Keeper,
	stakingKeeper *stakingkeeper.Keeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService:  storeService,
		cdc:           cdc,
		addressCodec:  addressCodec,
		authority:     authority,
		bankKeeper:    bankKeeper,
		stakingKeeper: stakingKeeper,

		Proposals:    collections.NewMap(sb, types.ProposalKey, "proposals", collections.Uint64Key, codec.CollValue[types.Proposal](cdc)),
		Votes:        collections.NewMap(sb, types.VoteKey, "votes", collections.PairKeyCodec(collections.Uint64Key, collections.StringKey), codec.CollValue[types.Vote](cdc)),
		Deposits:     collections.NewMap(sb, types.DepositKey, "deposits", collections.PairKeyCodec(collections.Uint64Key, collections.StringKey), codec.CollValue[types.Deposit](cdc)),
		Params:       collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Constitution: collections.NewItem(sb, types.ConstitutionKey, "constitution", collections.StringValue),
		ProposalID:   collections.NewSequence(sb, collections.NewPrefix(1), "proposal_id"),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// GetProposal returns the proposal with the given ID.
func (k Keeper) GetProposal(ctx context.Context, proposalID uint64) (types.Proposal, error) {
	return k.Proposals.Get(ctx, proposalID)
}

// SetProposal sets the proposal with the given ID.
func (k Keeper) SetProposal(ctx context.Context, proposal types.Proposal) error {
	return k.Proposals.Set(ctx, proposal.Id, proposal)
}

// GetVote returns the vote for the given proposal ID and voter.
func (k Keeper) GetVote(ctx context.Context, proposalID uint64, voter string) (types.Vote, error) {
	return k.Votes.Get(ctx, collections.Join(proposalID, voter))
}

// SetVote sets the vote for the given proposal ID and voter.
func (k Keeper) SetVote(ctx context.Context, vote types.Vote) error {
	return k.Votes.Set(ctx, collections.Join(vote.ProposalId, vote.Voter), vote)
}

// GetDeposit returns the deposit for the given proposal ID and depositor.
func (k Keeper) GetDeposit(ctx context.Context, proposalID uint64, depositor string) (types.Deposit, error) {
	return k.Deposits.Get(ctx, collections.Join(proposalID, depositor))
}

// SetDeposit sets the deposit for the given proposal ID and depositor.
func (k Keeper) SetDeposit(ctx context.Context, deposit types.Deposit) error {
	return k.Deposits.Set(ctx, collections.Join(deposit.ProposalId, deposit.Depositor), deposit)
}

// GetParams returns the governance parameters.
func (k Keeper) GetParams(ctx context.Context) (types.Params, error) {
	return k.Params.Get(ctx)
}

// SetParams sets the governance parameters.
func (k Keeper) SetParams(ctx context.Context, params types.Params) error {
	return k.Params.Set(ctx, params)
}

// GetConstitution returns the constitution.
func (k Keeper) GetConstitution(ctx context.Context) (string, error) {
	return k.Constitution.Get(ctx)
}

// SetConstitution sets the constitution.
func (k Keeper) SetConstitution(ctx context.Context, constitution string) error {
	return k.Constitution.Set(ctx, constitution)
}

// SubmitProposal submits a new proposal.
func (k Keeper) SubmitProposal(ctx context.Context, proposal types.Proposal) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get next proposal ID
	proposalID, err := k.ProposalID.Next(ctx)
	if err != nil {
		return 0, err
	}

	proposal.Id = proposalID
	proposal.SubmitTime = sdkCtx.BlockTime()
	proposal.Status = types.StatusDepositPeriod

	// Set deposit end time (use 1/3 of voting period as deposit period)
	params, err := k.GetParams(ctx)
	if err != nil {
		return 0, err
	}
	// Deposit period is 1/3 of voting period (common governance pattern)
	depositPeriod := params.VotingPeriod / 3
	proposal.DepositEndTime = proposal.SubmitTime.Add(depositPeriod)

	// Set proposal
	if err := k.SetProposal(ctx, proposal); err != nil {
		return 0, err
	}

	return proposalID, nil
}

// AddDeposit adds a deposit to a proposal.
func (k Keeper) AddDeposit(ctx context.Context, proposalID uint64, depositor string, depositAmount sdk.Coins) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get proposal
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}

	// Check if proposal is in deposit period
	if proposal.Status != types.StatusDepositPeriod {
		return types.ErrInvalidProposal
	}

	// Check if deposit period has ended
	if sdkCtx.BlockTime().After(proposal.DepositEndTime) {
		return types.ErrInvalidProposal
	}

	// Get or create deposit
	deposit, err := k.GetDeposit(ctx, proposalID, depositor)
	if err != nil {
		// Create new deposit
		deposit = types.NewDeposit(proposalID, depositor, depositAmount)
	} else {
		// Add to existing deposit
		deposit.Amount = deposit.Amount.Add(depositAmount...)
	}

	// Transfer coins from depositor account to governance module account
	if !depositAmount.IsZero() {
		depositorAddr, err := sdk.AccAddressFromBech32(depositor)
		if err != nil {
			return err
		}
		if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, depositorAddr, types.ModuleName, depositAmount); err != nil {
			return err
		}
	}

	// Update proposal total deposit
	proposal.TotalDeposit = proposal.TotalDeposit.Add(depositAmount...)

	// Get params
	params, err := k.GetParams(ctx)
	if err != nil {
		return err
	}

	// Check if proposal can enter voting period
	if proposal.TotalDeposit.IsAllGTE(params.MinDeposit) {
		proposal.Status = types.StatusVotingPeriod
		proposal.VotingStartTime = sdkCtx.BlockTime()
		proposal.VotingEndTime = proposal.VotingStartTime.Add(params.VotingPeriod)
	}

	// Save changes
	if err := k.SetDeposit(ctx, deposit); err != nil {
		return err
	}
	if err := k.SetProposal(ctx, proposal); err != nil {
		return err
	}

	return nil
}

// AddVote adds a vote to a proposal.
func (k Keeper) AddVote(ctx context.Context, proposalID uint64, voter string, options []types.WeightedVoteOption, metadata string) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get proposal
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}

	// Check if proposal is in voting period
	if proposal.Status != types.StatusVotingPeriod {
		return types.ErrInvalidProposal
	}

	// Check if voting period has ended
	if sdkCtx.BlockTime().After(proposal.VotingEndTime) {
		return types.ErrVotingPeriodEnded
	}

	// Create vote
	vote := types.NewVote(proposalID, voter, options, metadata)

	// Save vote
	return k.SetVote(ctx, vote)
}

// TallyVotes tallies the votes for a proposal using stake-weighted voting.
func (k Keeper) TallyVotes(ctx context.Context, proposalID uint64) (types.TallyResult, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return types.TallyResult{}, err
	}

	tally := types.EmptyTally()

	err = k.Votes.Walk(ctx, collections.NewPrefixedPairRange[uint64, string](proposalID), func(key collections.Pair[uint64, string], vote types.Vote) (bool, error) {
		weight := vote.Options[0].Weight.TruncateInt()

		for _, option := range vote.Options {
			switch option.Option {
			case types.OptionYes:
				tally.YesCount = tally.YesCount.Add(weight)
			case types.OptionNo:
				tally.NoCount = tally.NoCount.Add(weight)
			case types.OptionNoWithVeto:
				tally.NoWithVetoCount = tally.NoWithVetoCount.Add(weight)
			case types.OptionAbstain:
				tally.AbstainCount = tally.AbstainCount.Add(weight)
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

// GetProposals returns all proposals.
func (k Keeper) GetProposals(ctx context.Context) ([]types.Proposal, error) {
	var proposals []types.Proposal
	err := k.Proposals.Walk(ctx, nil, func(key uint64, proposal types.Proposal) (bool, error) {
		proposals = append(proposals, proposal)
		return false, nil
	})
	return proposals, err
}

// GetVotes returns all votes for a proposal.
func (k Keeper) GetVotes(ctx context.Context, proposalID uint64) ([]types.Vote, error) {
	var votes []types.Vote
	err := k.Votes.Walk(ctx, collections.NewPrefixedPairRange[uint64, string](proposalID), func(key collections.Pair[uint64, string], vote types.Vote) (bool, error) {
		votes = append(votes, vote)
		return false, nil
	})
	return votes, err
}

// GetDeposits returns all deposits for a proposal.
func (k Keeper) GetDeposits(ctx context.Context, proposalID uint64) ([]types.Deposit, error) {
	var deposits []types.Deposit
	err := k.Deposits.Walk(ctx, collections.NewPrefixedPairRange[uint64, string](proposalID), func(key collections.Pair[uint64, string], deposit types.Deposit) (bool, error) {
		deposits = append(deposits, deposit)
		return false, nil
	})
	return deposits, err
}
