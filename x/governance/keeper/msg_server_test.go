package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/governance/keeper"
	"marketplace/x/governance/types"
)

func TestMsgServerSubmitProposal(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	resp, err := srv.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer: "mall1proposer",
		Title:    "Raise staking rewards",
		Summary:  "Increase reward divisor by 10%",
	})
	require.NoError(t, err)

	got, err := f.k.GetProposal(f.ctx, resp.ProposalId)
	require.NoError(t, err)
	require.Equal(t, types.StatusDepositPeriod, got.Status)
	require.Equal(t, "mall1proposer", got.Proposer)
}

func TestMsgServerSubmitProposal_WithInitialDeposit(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	proposer := sdk.AccAddress([]byte("test_proposer_______")).String()

	deposit := sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(1000)))
	resp, err := srv.SubmitProposal(f.ctx, &types.MsgSubmitProposal{
		Proposer:       proposer,
		Title:          "Fund treasury initiative",
		Summary:        "Deposit-backed proposal",
		InitialDeposit: deposit,
	})
	require.NoError(t, err)

	got, err := f.k.GetDeposit(f.ctx, resp.ProposalId, proposer)
	require.NoError(t, err)
	require.Equal(t, deposit, got.Amount)
}

func TestMsgServerVote(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	proposal := types.Proposal{
		Id:              1,
		Status:          types.StatusVotingPeriod,
		SubmitTime:      f.ctx.BlockTime(),
		VotingStartTime: f.ctx.BlockTime(),
		VotingEndTime:   f.ctx.BlockTime().Add(types.DefaultParams().VotingPeriod),
	}
	require.NoError(t, f.k.SetProposal(f.ctx, proposal))

	_, err := srv.Vote(f.ctx, &types.MsgVote{ProposalId: 1, Voter: "mall1voter", Option: types.OptionYes})
	require.NoError(t, err)

	got, err := f.k.GetVote(f.ctx, 1, "mall1voter")
	require.NoError(t, err)
	require.Len(t, got.Options, 1)
	require.Equal(t, types.OptionYes, got.Options[0].Option)
}

func TestMsgServerVote_ProposalNotFound(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	_, err := srv.Vote(f.ctx, &types.MsgVote{ProposalId: 999, Voter: "mall1voter", Option: types.OptionYes})
	require.Error(t, err)
}

func TestMsgServerVote_NotInVotingPeriod(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	// Still in the deposit period, so voting must be rejected.
	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{
		Id:             1,
		Status:         types.StatusDepositPeriod,
		SubmitTime:     f.ctx.BlockTime(),
		DepositEndTime: f.ctx.BlockTime().Add(types.DefaultParams().GetDepositPeriod()),
	}))

	_, err := srv.Vote(f.ctx, &types.MsgVote{ProposalId: 1, Voter: "mall1voter", Option: types.OptionYes})
	require.Error(t, err)
}

func TestMsgServerVoteWeighted(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{
		Id:              1,
		Status:          types.StatusVotingPeriod,
		SubmitTime:      f.ctx.BlockTime(),
		VotingStartTime: f.ctx.BlockTime(),
		VotingEndTime:   f.ctx.BlockTime().Add(types.DefaultParams().VotingPeriod),
	}))

	options := []types.WeightedVoteOption{
		{Option: types.OptionYes, Weight: math.LegacyNewDecWithPrec(6, 1)},
		{Option: types.OptionNo, Weight: math.LegacyNewDecWithPrec(4, 1)},
	}
	_, err := srv.VoteWeighted(f.ctx, &types.MsgVoteWeighted{ProposalId: 1, Voter: "mall1voter", WeightedOptions: options})
	require.NoError(t, err)

	got, err := f.k.GetVote(f.ctx, 1, "mall1voter")
	require.NoError(t, err)
	require.Len(t, got.Options, 2)
}

func TestMsgServerDeposit(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	depositor := sdk.AccAddress([]byte("test_depositor______")).String()

	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{
		Id:             1,
		Status:         types.StatusDepositPeriod,
		SubmitTime:     f.ctx.BlockTime(),
		DepositEndTime: f.ctx.BlockTime().Add(types.DefaultParams().GetDepositPeriod()),
	}))

	amount := sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(500)))
	_, err := srv.Deposit(f.ctx, &types.MsgDeposit{ProposalId: 1, Depositor: depositor, Amount: amount})
	require.NoError(t, err)

	got, err := f.k.GetDeposit(f.ctx, 1, depositor)
	require.NoError(t, err)
	require.Equal(t, amount, got.Amount)
}

func TestMsgServerDeposit_ProposalNotFound(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	amount := sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(500)))
	_, err := srv.Deposit(f.ctx, &types.MsgDeposit{ProposalId: 999, Depositor: "mall1depositor", Amount: amount})
	require.Error(t, err)
}

func TestMsgServerDeposit_AfterDepositPeriodEnds(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	require.NoError(t, f.k.SetProposal(f.ctx, types.Proposal{
		Id:             1,
		Status:         types.StatusDepositPeriod,
		SubmitTime:     f.ctx.BlockTime().Add(-48 * 60 * 60 * 1e9), // well in the past
		DepositEndTime: f.ctx.BlockTime().Add(-1),                  // already elapsed
	}))

	amount := sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(500)))
	_, err := srv.Deposit(f.ctx, &types.MsgDeposit{ProposalId: 1, Depositor: "mall1depositor", Amount: amount})
	require.Error(t, err)
}

func TestMsgServerUpdateParams(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)
	// The fixture wires up the keeper's authority from this module address string
	// (see initFixtureWithStakingKeeper in keeper_test.go); re-derive the same
	// value rather than assuming it round-trips back to the module address itself.
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName).String()
	authority := sdk.AccAddress([]byte(moduleAddr)).String()

	newParams := types.DefaultParams()
	newParams.VotingPeriod = newParams.VotingPeriod * 2

	_, err := srv.UpdateParams(f.ctx, &types.MsgUpdateParams{Authority: authority, Params: newParams})
	require.NoError(t, err)

	got, err := f.k.GetParams(f.ctx)
	require.NoError(t, err)
	require.Equal(t, newParams.VotingPeriod, got.VotingPeriod)
}

func TestMsgServerUpdateParams_Unauthorized(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(f.k)

	_, err := srv.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: "mall1notthegovmodule",
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)
}
