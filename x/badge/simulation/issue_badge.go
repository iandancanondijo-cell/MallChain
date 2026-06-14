package simulation

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"marketplace/x/badge/keeper"
	"marketplace/x/badge/types"
)

func SimulateMsgIssueBadge(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msg := &types.MsgIssueBadge{
			Creator: simAccount.Address.String(),
		}

		// TODO: Handle the IssueBadge simulation

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "IssueBadge simulation not implemented"), nil, nil
	}
}
