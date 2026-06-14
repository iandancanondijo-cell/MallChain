package keeper

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/cosmos/cosmos-sdk/types/query"

	"marketplace/x/governance/types"
)

type queryServer struct {
	Keeper
}

// NewQueryServerImpl returns an implementation of the QueryServer interface
// for the provided Keeper.
func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{Keeper: keeper}
}

var _ types.QueryServer = queryServer{}

// Params implements Query.Params method.
func (k queryServer) Params(ctx context.Context, req *types.QueryParamsRequest) (*types.QueryParamsResponse, error) {
	params, err := k.Keeper.GetParams(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &types.QueryParamsResponse{Params: params}, nil
}

// Proposals implements Query.Proposals method.
func (k queryServer) Proposals(ctx context.Context, req *types.QueryProposalsRequest) (*types.QueryProposalsResponse, error) {
	proposals, err := k.Keeper.GetProposals(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Filter proposals based on status if specified
	var filteredProposals []types.Proposal
	for _, proposal := range proposals {
		if req.ProposalStatus != types.StatusNil && proposal.Status != req.ProposalStatus {
			continue
		}
		if req.Voter != "" {
			// Check if voter has voted on this proposal
			_, err := k.Keeper.GetVote(ctx, proposal.Id, req.Voter)
			if err != nil {
				continue
			}
		}
		if req.Depositor != "" {
			// Check if depositor has deposited on this proposal
			_, err := k.Keeper.GetDeposit(ctx, proposal.Id, req.Depositor)
			if err != nil {
				continue
			}
		}
		filteredProposals = append(filteredProposals, proposal)
	}

	// Handle pagination
	total := uint64(len(filteredProposals))
	start := (req.Pagination.Offset)
	end := start + req.Pagination.Limit
	if end > total {
		end = total
	}

	return &types.QueryProposalsResponse{
		Proposals: filteredProposals[start:end],
		Pagination: &query.PageResponse{
			NextKey: nil,
			Total:   total,
		},
	}, nil
}

// Proposal implements Query.Proposal method.
func (k queryServer) Proposal(ctx context.Context, req *types.QueryProposalRequest) (*types.QueryProposalResponse, error) {
	proposal, err := k.Keeper.GetProposal(ctx, req.ProposalId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "proposal not found")
	}

	return &types.QueryProposalResponse{Proposal: proposal}, nil
}

// Deposits implements Query.Deposits method.
func (k queryServer) Deposits(ctx context.Context, req *types.QueryDepositsRequest) (*types.QueryDepositsResponse, error) {
	deposits, err := k.Keeper.GetDeposits(ctx, req.ProposalId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Handle pagination
	total := uint64(len(deposits))
	start := (req.Pagination.Offset)
	end := start + req.Pagination.Limit
	if end > total {
		end = total
	}

	return &types.QueryDepositsResponse{
		Deposits: deposits[start:end],
		Pagination: &query.PageResponse{
			NextKey: nil,
			Total:   total,
		},
	}, nil
}

// Deposit implements Query.Deposit method.
func (k queryServer) Deposit(ctx context.Context, req *types.QueryDepositRequest) (*types.QueryDepositResponse, error) {
	deposit, err := k.Keeper.GetDeposit(ctx, req.ProposalId, req.Depositor)
	if err != nil {
		return nil, status.Error(codes.NotFound, "deposit not found")
	}

	return &types.QueryDepositResponse{Deposit: deposit}, nil
}

// Votes implements Query.Votes method.
func (k queryServer) Votes(ctx context.Context, req *types.QueryVotesRequest) (*types.QueryVotesResponse, error) {
	votes, err := k.Keeper.GetVotes(ctx, req.ProposalId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	// Handle pagination
	total := uint64(len(votes))
	start := (req.Pagination.Offset)
	end := start + req.Pagination.Limit
	if end > total {
		end = total
	}

	return &types.QueryVotesResponse{
		Votes: votes[start:end],
		Pagination: &query.PageResponse{
			NextKey: nil,
			Total:   total,
		},
	}, nil
}

// Vote implements Query.Vote method.
func (k queryServer) Vote(ctx context.Context, req *types.QueryVoteRequest) (*types.QueryVoteResponse, error) {
	vote, err := k.Keeper.GetVote(ctx, req.ProposalId, req.Voter)
	if err != nil {
		return nil, status.Error(codes.NotFound, "vote not found")
	}

	return &types.QueryVoteResponse{Vote: vote}, nil
}

// TallyResult implements Query.TallyResult method.
func (k queryServer) TallyResult(ctx context.Context, req *types.QueryTallyResultRequest) (*types.QueryTallyResultResponse, error) {
	// Get proposal to check if voting has ended
	proposal, err := k.Keeper.GetProposal(ctx, req.ProposalId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "proposal not found")
	}

	var tally types.TallyResult
	if proposal.Status == types.StatusPassed || proposal.Status == types.StatusRejected || proposal.Status == types.StatusFailed {
		// Use final tally result if voting has ended
		tally = proposal.FinalTallyResult
	} else {
		// Tally current votes if voting is still active
		tally, err = k.Keeper.TallyVotes(ctx, req.ProposalId)
		if err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
	}

	return &types.QueryTallyResultResponse{Tally: tally}, nil
}
