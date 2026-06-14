package mallpoints

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	mallpointssimulation "marketplace/x/mallpoints/simulation"
	"marketplace/x/mallpoints/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	mallpointsGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&mallpointsGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgAwardPoints          = "op_weight_msg_mallpoints"
		defaultWeightMsgAwardPoints int = 100
	)

	var weightMsgAwardPoints int
	simState.AppParams.GetOrGenerate(opWeightMsgAwardPoints, &weightMsgAwardPoints, nil,
		func(_ *rand.Rand) {
			weightMsgAwardPoints = defaultWeightMsgAwardPoints
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgAwardPoints,
		mallpointssimulation.SimulateMsgAwardPoints(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))
	const (
		opWeightMsgConvertToMallcoin          = "op_weight_msg_mallpoints"
		defaultWeightMsgConvertToMallcoin int = 100
	)

	var weightMsgConvertToMallcoin int
	simState.AppParams.GetOrGenerate(opWeightMsgConvertToMallcoin, &weightMsgConvertToMallcoin, nil,
		func(_ *rand.Rand) {
			weightMsgConvertToMallcoin = defaultWeightMsgConvertToMallcoin
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgConvertToMallcoin,
		mallpointssimulation.SimulateMsgConvertToMallcoin(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
