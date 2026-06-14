package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/governance/types"
)

type msgServer struct {
	Keeper
}

// NewMsgServerImpl returns an implementation of the MsgServer interface
// for the provided Keeper.
func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{Keeper: keeper}
}

var _ types.MsgServer = msgServer{}

// SubmitProposal implements MsgServer.SubmitProposal method.
func (k msgServer) SubmitProposal(ctx context.Context, msg *types.MsgSubmitProposal) (*types.MsgSubmitProposalResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Create proposal with minimal fields
	proposal := types.Proposal{
		Title:        msg.Title,
		Summary:      msg.Summary,
		Metadata:     msg.Metadata,
		Proposer:     msg.Proposer,
		Status:       types.StatusDepositPeriod,
		TotalDeposit: msg.InitialDeposit,
		SubmitTime:   sdkCtx.BlockTime(),
	}

	// Submit proposal
	proposalID, err := k.Keeper.SubmitProposal(ctx, proposal)
	if err != nil {
		return nil, err
	}

	// Add initial deposit if provided
	if !msg.InitialDeposit.IsZero() {
		if err := k.Keeper.AddDeposit(ctx, proposalID, msg.Proposer, msg.InitialDeposit); err != nil {
			return nil, err
		}
	}

	return &types.MsgSubmitProposalResponse{
		ProposalId: proposalID,
	}, nil
}

// Vote implements MsgServer.Vote method.
func (k msgServer) Vote(ctx context.Context, msg *types.MsgVote) (*types.MsgVoteResponse, error) {
	// Convert vote option to weighted vote options
	weightedOptions := []types.WeightedVoteOption{
		{
			Option: msg.Option,
			Weight: math.LegacyOneDec(),
		},
	}

	// Add vote
	if err := k.Keeper.AddVote(ctx, msg.ProposalId, msg.Voter, weightedOptions, msg.Metadata); err != nil {
		return nil, err
	}

	return &types.MsgVoteResponse{}, nil
}

// VoteWeighted implements MsgServer.VoteWeighted method.
func (k msgServer) VoteWeighted(ctx context.Context, msg *types.MsgVoteWeighted) (*types.MsgVoteWeightedResponse, error) {
	// Add vote
	if err := k.Keeper.AddVote(ctx, msg.ProposalId, msg.Voter, msg.WeightedOptions, msg.Metadata); err != nil {
		return nil, err
	}

	return &types.MsgVoteWeightedResponse{}, nil
}

// Deposit implements MsgServer.Deposit method.
func (k msgServer) Deposit(ctx context.Context, msg *types.MsgDeposit) (*types.MsgDepositResponse, error) {
	// Add deposit
	if err := k.Keeper.AddDeposit(ctx, msg.ProposalId, msg.Depositor, msg.Amount); err != nil {
		return nil, err
	}

	return &types.MsgDepositResponse{}, nil
}

// UpdateParams implements MsgServer.UpdateParams method.
func (k msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	// Check authority
	if msg.Authority != sdk.AccAddress(k.authority).String() {
		return nil, fmt.Errorf("invalid authority; expected %s, got %s", sdk.AccAddress(k.authority).String(), msg.Authority)
	}

	// Set params
	if err := k.Keeper.SetParams(ctx, msg.Params); err != nil {
		return nil, err
	}

	return &types.MsgUpdateParamsResponse{}, nil
}
