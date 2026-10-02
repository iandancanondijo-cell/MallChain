package simulation

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"marketplace/x/governance/keeper"
	"marketplace/x/governance/types"
)

func SimulateMsgVote(
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		proposals, err := k.GetProposals(ctx)
		if err != nil || len(proposals) == 0 {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgVote{}), "no proposals available"), nil, nil
		}

		var activeProposal types.Proposal
		var found bool
		for _, p := range proposals {
			if p.Status == types.ProposalStatus_PROPOSAL_STATUS_VOTING_PERIOD {
				activeProposal = p
				found = true
				break
			}
		}
		if !found {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgVote{}), "no active proposals"), nil, nil
		}

		voter, _ := simtypes.RandomAcc(r, accs)

		options := []types.VoteOption{
			types.VoteOption_VOTE_OPTION_YES,
			types.VoteOption_VOTE_OPTION_ABSTAIN,
			types.VoteOption_VOTE_OPTION_NO,
			types.VoteOption_VOTE_OPTION_NO_WITH_VETO,
		}

		msg := &types.MsgVote{
			ProposalId: activeProposal.Id,
			Voter:      voter.Address.String(),
			Option:     options[r.Intn(len(options))],
		}

		server := keeper.NewMsgServerImpl(k)
		_, err = server.Vote(ctx, msg)
		if err != nil {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, "Vote simulation completed successfully"), nil, nil
	}
}
