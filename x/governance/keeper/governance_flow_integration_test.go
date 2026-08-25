package keeper_test

import (
	"testing"
	"time"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/governance/keeper"
	"marketplace/x/governance/types"
)

// TestGovernanceFullLifecycle exercises the entire proposal → deposit →
// voting-period transition → vote → tally → execution pipeline in one
// sequence, driving it exactly the way a real chain does: through the real
// msg_server handlers and the real EndBlocker, never by hand-setting a
// proposal's Status. Unit tests elsewhere in this package cover each of
// these steps individually (submit, vote, quorum, deposit refunds); this
// test exists to catch integration bugs between them — e.g. a proposal that
// individually validates at every step but never actually reaches Passed
// when driven end-to-end.
func TestGovernanceFullLifecycle(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	proposer := sdk.AccAddress([]byte("integration_proposer")).String()
	voter := sdk.AccAddress([]byte("integration_voter___")).String()

	start := time.Now().UTC()
	f.ctx = f.ctx.WithBlockTime(start)

	// 1. Submit a proposal with a deposit that meets MinDeposit (1000stake,
	// see DefaultParams). AddDeposit (keeper.go) transitions a proposal to
	// StatusVotingPeriod synchronously the moment TotalDeposit clears
	// MinDeposit — including when that happens via InitialDeposit inside
	// SubmitProposal itself, confirmed live by this test: it does not wait
	// for EndBlocker to notice. EndBlocker's deposit-period handling only
	// ever fires the *other* branch (timeout before MinDeposit is reached),
	// which is exercised by processDepositPeriodEnd's own unit tests.
	deposit := sdk.NewCoins(sdk.NewInt64Coin("stake", 1000))
	submitResp, err := srv.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:       proposer,
		Title:          "Integration test proposal",
		Summary:        "Full lifecycle coverage",
		InitialDeposit: deposit,
	})
	require.NoError(t, err)
	proposalID := submitResp.ProposalId

	proposal, err := f.k.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.StatusVotingPeriod, proposal.Status, "a deposit meeting MinDeposit must enter voting immediately")

	// 2. Cast a Yes vote through the real msg_server handler.
	_, err = srv.Vote(f.ctx, &types.MsgVote{ProposalId: proposalID, Voter: voter, Option: types.OptionYes})
	require.NoError(t, err)

	// 3. Advance past the voting period and run EndBlocker — tally + quorum
	// + threshold + execution all happen inside this single call.
	f.ctx = f.ctx.WithBlockTime(proposal.VotingEndTime.Add(time.Second))
	require.NoError(t, f.k.EndBlocker(f.ctx))

	final, err := f.k.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.StatusPassed, final.Status,
		"a single unanimous Yes vote under the fixture's mock staking keeper (quorum trivially satisfied when TotalBondedTokens is zero) must pass")
	require.True(t, final.FinalTallyResult.YesCount.Equal(math.OneInt()), "tally must record the one cast vote")
}

// TestGovernanceFullLifecycle_RejectedByVeto proves the same driven pipeline
// correctly rejects a proposal when NoWithVeto crosses the veto threshold,
// so the happy-path test above isn't just exercising a keeper that always
// passes regardless of votes.
func TestGovernanceFullLifecycle_RejectedByVeto(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	proposer := sdk.AccAddress([]byte("veto_proposer_______")).String()
	voter := sdk.AccAddress([]byte("veto_voter__________")).String()

	start := time.Now().UTC()
	f.ctx = f.ctx.WithBlockTime(start)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("stake", 1000))
	submitResp, err := srv.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:       proposer,
		Title:          "Integration test veto proposal",
		Summary:        "Should be rejected",
		InitialDeposit: deposit,
	})
	require.NoError(t, err)
	proposalID := submitResp.ProposalId

	proposal, err := f.k.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.StatusVotingPeriod, proposal.Status, "a deposit meeting MinDeposit must enter voting immediately")

	_, err = srv.Vote(f.ctx, &types.MsgVote{ProposalId: proposalID, Voter: voter, Option: types.OptionNoWithVeto})
	require.NoError(t, err)

	f.ctx = f.ctx.WithBlockTime(proposal.VotingEndTime.Add(time.Second))
	require.NoError(t, f.k.EndBlocker(f.ctx))

	final, err := f.k.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.StatusRejected, final.Status, "a unanimous NoWithVeto vote must reject the proposal")
}
