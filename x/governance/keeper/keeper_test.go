package keeper_test

import (
	"context"
	"testing"
	"time"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	"marketplace/x/governance/keeper"
	"marketplace/x/governance/types"
)

type fixture struct {
	ctx   sdk.Context
	k     keeper.Keeper
	codec address.Codec
}

type mockBankKeeper struct{}

func (mockBankKeeper) SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	return nil
}

func (mockBankKeeper) SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	return nil
}

func initFixture(t *testing.T) *fixture {
	t.Helper()
	protoCdc := codec.NewProtoCodec(cdctypes.NewInterfaceRegistry())
	addressCdc := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.ModuleName).String()

	k, err := keeper.NewKeeper(
		storeService,
		protoCdc,
		addressCdc,
		[]byte(authority),
		mockBankKeeper{},
		nil,
		nil,
	)
	require.NoError(t, err)

	require.NoError(t, k.SetParams(ctx, types.DefaultParams()))

	return &fixture{ctx: ctx, k: k, codec: addressCdc}
}

func TestProposalCRUD(t *testing.T) {
	f := initFixture(t)

	params := types.DefaultParams()
	proposal := types.Proposal{
		Id:              1,
		Status:          types.StatusDepositPeriod,
		SubmitTime:      f.ctx.BlockTime(),
		DepositEndTime:  f.ctx.BlockTime().Add(params.GetDepositPeriod()),
		VotingStartTime: f.ctx.BlockTime(),
		VotingEndTime:   f.ctx.BlockTime().Add(params.VotingPeriod),
	}

	err := f.k.SetProposal(f.ctx, proposal)
	require.NoError(t, err)

	got, err := f.k.GetProposal(f.ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, uint64(1), got.Id)
	assert.Equal(t, types.StatusDepositPeriod, got.Status)
}

func TestVoteCRUD(t *testing.T) {
	f := initFixture(t)

	params := types.DefaultParams()
	proposal := types.Proposal{
		Id:              1,
		Status:          types.StatusVotingPeriod,
		SubmitTime:      f.ctx.BlockTime(),
		DepositEndTime:  f.ctx.BlockTime().Add(params.GetDepositPeriod()),
		VotingStartTime: f.ctx.BlockTime(),
		VotingEndTime:   f.ctx.BlockTime().Add(params.VotingPeriod),
	}
	require.NoError(t, f.k.SetProposal(f.ctx, proposal))

	vote := types.NewVote(1, "mall1voter", []types.WeightedVoteOption{{Option: types.OptionYes, Weight: sdk.OneDec()}}, "")
	err := f.k.SetVote(f.ctx, vote)
	require.NoError(t, err)

	got, err := f.k.GetVote(f.ctx, 1, "mall1voter")
	require.NoError(t, err)
	assert.Equal(t, "mall1voter", got.Voter)
}

func TestDepositCRUD(t *testing.T) {
	f := initFixture(t)

	params := types.DefaultParams()
	proposal := types.Proposal{
		Id:             1,
		Status:         types.StatusDepositPeriod,
		SubmitTime:     f.ctx.BlockTime(),
		DepositEndTime: f.ctx.BlockTime().Add(params.GetDepositPeriod()),
	}
	require.NoError(t, f.k.SetProposal(f.ctx, proposal))

	deposit := types.NewDeposit(1, "mall1depositor", sdk.NewCoins(sdk.NewCoin("umall", sdk.NewInt(1000))))
	err := f.k.SetDeposit(f.ctx, deposit)
	require.NoError(t, err)

	got, err := f.k.GetDeposit(f.ctx, 1, "mall1depositor")
	require.NoError(t, err)
	assert.Equal(t, "mall1depositor", got.Depositor)
}

func TestParamsCRUD(t *testing.T) {
	f := initFixture(t)

	params, err := f.k.GetParams(f.ctx)
	require.NoError(t, err)
	assert.Equal(t, types.DefaultParams().VotingPeriod, params.VotingPeriod)
}

func TestConstitutionCRUD(t *testing.T) {
	f := initFixture(t)

	constitution := "Governance Constitution v1.0"
	err := f.k.SetConstitution(f.ctx, constitution)
	require.NoError(t, err)

	got, err := f.k.GetConstitution(f.ctx)
	require.NoError(t, err)
	assert.Equal(t, constitution, got)
}

func TestGenesisRoundTrip(t *testing.T) {
	f := initFixture(t)

	genState := &types.GenesisState{
		StartingProposalId: 42,
		Proposals: []types.Proposal{
			{Id: 1, Status: types.StatusPassed, SubmitTime: f.ctx.BlockTime()},
		},
		Votes: []types.Vote{
			{ProposalId: 1, Voter: "mall1voter"},
		},
		Deposits: []types.Deposit{
			{ProposalId: 1, Depositor: "mall1depositor", Amount: sdk.NewCoins(sdk.NewCoin("umall", sdk.NewInt(1000)))},
		},
		Constitution: "Test Constitution",
	}

	require.NoError(t, f.k.InitGenesis(f.ctx, genState))

	exported, err := f.k.ExportGenesis(f.ctx)
	require.NoError(t, err)

	assert.Equal(t, uint64(42), exported.StartingProposalId)
	assert.Len(t, exported.Proposals, 1)
	assert.Equal(t, "Test Constitution", exported.Constitution)
}

func TestEndBlockerHasQuorumNilStakingKeeper(t *testing.T) {
	f := initFixture(t)

	params := types.DefaultParams()
	totalVotes := sdk.NewInt(1000)

	proposal := types.Proposal{
		Id:              1,
		Status:          types.StatusVotingPeriod,
		SubmitTime:      f.ctx.BlockTime().Add(-time.Hour),
		DepositEndTime:  f.ctx.BlockTime().Add(-30 * time.Minute),
		VotingStartTime: f.ctx.BlockTime().Add(-30 * time.Minute),
		VotingEndTime:   f.ctx.BlockTime(),
		FinalTallyResult: types.TallyResult{
			YesCount:        totalVotes.QuoRaw(2),
			NoCount:         totalVotes.QuoRaw(4),
			NoWithVetoCount: totalVotes.QuoRaw(4),
			AbstainCount:    totalVotes.QuoRaw(4),
		},
	}
	require.NoError(t, f.k.SetProposal(f.ctx, proposal))

	tally, err := f.k.TallyVotes(f.ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, totalVotes.QuoRaw(2), tally.YesCount)
}