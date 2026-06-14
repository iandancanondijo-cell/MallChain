package badge

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	badgesimulation "marketplace/x/badge/simulation"
	"marketplace/x/badge/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	badgeGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&badgeGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgIssueBadge          = "op_weight_msg_badge"
		defaultWeightMsgIssueBadge int = 100
	)

	var weightMsgIssueBadge int
	simState.AppParams.GetOrGenerate(opWeightMsgIssueBadge, &weightMsgIssueBadge, nil,
		func(_ *rand.Rand) {
			weightMsgIssueBadge = defaultWeightMsgIssueBadge
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgIssueBadge,
		badgesimulation.SimulateMsgIssueBadge(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
