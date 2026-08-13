package keeper_test

import (
	"context"
	"testing"
	"time"

	"cosmossdk.io/core/address"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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

type mockStakingKeeper struct{}

func (mockStakingKeeper) GetDelegatorDelegations(ctx context.Context, delegator sdk.AccAddress, maxRetrieve uint16) ([]stakingtypes.Delegation, error) {
	return nil, nil
}

func (mockStakingKeeper) TotalBondedTokens(ctx context.Context) (math.Int, error) {
	return math.ZeroInt(), nil
}

func (mockStakingKeeper) GetValidator(ctx context.Context, addr sdk.ValAddress) (stakingtypes.Validator, error) {
	return stakingtypes.Validator{}, nil
}

func (mockStakingKeeper) Slash(ctx context.Context, consAddr sdk.ConsAddress, infractionHeight, power int64, slashFactor math.LegacyDec) (math.Int, error) {
	return math.ZeroInt(), nil
}

func initFixture(t *testing.T) *fixture {
	t.Helper()
	return initFixtureWithStakingKeeper(t, mockStakingKeeper{})
}

func initFixtureWithStakingKeeper(t *testing.T, stakingKeeper types.StakingKeeper) *fixture {
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
		stakingKeeper,
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

	vote := types.NewVote(1, "mall1voter", []types.WeightedVoteOption{{Option: types.OptionYes, Weight: math.LegacyOneDec()}}, "")
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

	deposit := types.NewDeposit(1, "mall1depositor", sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(1000))))
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
			{ProposalId: 1, Depositor: "mall1depositor", Amount: sdk.NewCoins(sdk.NewCoin("umall", math.NewInt(1000)))},
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

// A nil staking keeper means there's no way to verify bonded-token quorum,
// so hasQuorum must reject the proposal even when every cast vote is "yes".
func TestEndBlockerHasQuorumNilStakingKeeper(t *testing.T) {
	f := initFixtureWithStakingKeeper(t, nil)

	proposal := types.Proposal{
		Id:              1,
		Status:          types.StatusVotingPeriod,
		SubmitTime:      f.ctx.BlockTime().Add(-time.Hour),
		DepositEndTime:  f.ctx.BlockTime().Add(-30 * time.Minute),
		VotingStartTime: f.ctx.BlockTime().Add(-30 * time.Minute),
		VotingEndTime:   f.ctx.BlockTime().Add(-time.Minute),
	}
	require.NoError(t, f.k.SetProposal(f.ctx, proposal))

	vote := types.NewVote(1, "mall1voter", []types.WeightedVoteOption{{Option: types.OptionYes, Weight: math.LegacyOneDec()}}, "")
	require.NoError(t, f.k.SetVote(f.ctx, vote))

	require.NoError(t, f.k.EndBlocker(f.ctx))

	got, err := f.k.GetProposal(f.ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, types.StatusRejected, got.Status)
}
