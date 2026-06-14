package mlcoin

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	mlcoinsimulation "marketplace/x/mlcoin/simulation"
	"marketplace/x/mlcoin/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	mlcoinGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&mlcoinGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgTransferMallcoin          = "op_weight_msg_mlcoin"
		defaultWeightMsgTransferMallcoin int = 100
	)

	var weightMsgTransferMallcoin int
	simState.AppParams.GetOrGenerate(opWeightMsgTransferMallcoin, &weightMsgTransferMallcoin, nil,
		func(_ *rand.Rand) {
			weightMsgTransferMallcoin = defaultWeightMsgTransferMallcoin
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgTransferMallcoin,
		mlcoinsimulation.SimulateMsgTransferMallcoin(am.authKeeper, am.bankKeeper, *am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
