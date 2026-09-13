package keeper_test

import (
	"testing"

	"github.com/cosmos/cosmos-sdk/types/query"
	"github.com/stretchr/testify/require"

	"marketplace/x/governance/keeper"
	"marketplace/x/governance/types"
)

// Regression coverage: Proposals/Deposits/Votes all dereferenced
// req.Pagination.Offset directly with no nil check, so any caller — a raw
// gRPC client, not just the REST gateway which always fills Pagination in —
// sending a request with Pagination left unset crashed the node outright.
// A separate bug in the same code (start + 0 == start whenever Limit was
// left at its zero value) silently returned an EMPTY page instead of
// "no limit" for any caller that omitted Limit, even with Offset: 0.

func seedProposals(t *testing.T, f *fixture, n int) {
	t.Helper()
	for i := 1; i <= n; i++ {
		require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{
			Id:     uint64(i),
			Status: types.StatusVotingPeriod,
		}))
	}
}

func TestQueryProposals_NilPaginationDoesNotPanicAndReturnsEverything(t *testing.T) {
	f := initFixture(t)
	seedProposals(t, f, 3)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Proposals(f.ctx, &types.QueryProposalsRequest{Pagination: nil})
	require.NoError(t, err)
	require.Len(t, resp.Proposals, 3)
	require.EqualValues(t, 3, resp.Pagination.Total)
}

func TestQueryProposals_NilRequestRejectedNotPanicked(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Proposals(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestQueryProposals_ZeroLimitMeansNoLimitNotEmptyPage(t *testing.T) {
	f := initFixture(t)
	seedProposals(t, f, 5)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Proposals(f.ctx, &types.QueryProposalsRequest{
		Pagination: &query.PageRequest{Offset: 0, Limit: 0},
	})
	require.NoError(t, err)
	require.Len(t, resp.Proposals, 5)
}

func TestQueryProposals_RealLimitStillTruncates(t *testing.T) {
	f := initFixture(t)
	seedProposals(t, f, 5)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Proposals(f.ctx, &types.QueryProposalsRequest{
		Pagination: &query.PageRequest{Offset: 1, Limit: 2},
	})
	require.NoError(t, err)
	require.Len(t, resp.Proposals, 2)
	require.EqualValues(t, 5, resp.Pagination.Total)
}

func TestQueryDeposits_NilPaginationDoesNotPanic(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{Id: 1, Status: types.StatusVotingPeriod}))
	require.NoError(t, f.k.SetDeposit(f.ctx, types.Deposit{ProposalId: 1, Depositor: "depositor-1"}))
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Deposits(f.ctx, &types.QueryDepositsRequest{ProposalId: 1, Pagination: nil})
	require.NoError(t, err)
	require.Len(t, resp.Deposits, 1)
}

func TestQueryVotes_NilPaginationDoesNotPanic(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{Id: 1, Status: types.StatusVotingPeriod}))
	require.NoError(t, f.k.SetVote(f.ctx, types.Vote{ProposalId: 1, Voter: "voter-1"}))
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Votes(f.ctx, &types.QueryVotesRequest{ProposalId: 1, Pagination: nil})
	require.NoError(t, err)
	require.Len(t, resp.Votes, 1)
}

func TestQueryProposal_NilRequestRejectedNotPanicked(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Proposal(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestQueryVote_NilRequestRejectedNotPanicked(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Vote(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestQueryDeposit_NilRequestRejectedNotPanicked(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.Deposit(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestQueryTallyResult_NilRequestRejectedNotPanicked(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.k)

	resp, err := qs.TallyResult(f.ctx, nil)
	require.Error(t, err)
	require.Nil(t, resp)
}
