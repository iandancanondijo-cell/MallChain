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

func SimulateMsgConvertToMallcoin(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		// ConvertToMallcoin requires:
		// 1. Conversion window to be open (15th of month)
		// 2. User to have a badge
		// 3. Sufficient Mallpoints balance
		// Simulation is disabled to avoid generating invalid transactions.
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msg := &types.MsgConvertToMallcoin{
			Creator: simAccount.Address.String(),
		}

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "ConvertToMallcoin requires badge and conversion window"), nil, nil
	}
}
