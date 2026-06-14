package simulation

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"marketplace/x/mallpoints/keeper"
	"marketplace/x/mallpoints/types"
)

func SimulateMsgAwardPoints(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		// AwardPoints is an admin-gated operation requiring proof-of-work validation.
		// Simulation is disabled to avoid generating invalid transactions.
		// In production, points are awarded through verified engagement tasks.
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msg := &types.MsgAwardPoints{
			Creator: simAccount.Address.String(),
		}

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "AwardPoints requires admin authorization"), nil, nil
	}
}
