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

		badgeTypes := []string{"verified", "merchant", "premium", "founder", "early_adopter"}

		var recipient simtypes.Account
		var badgeType string
		var found bool

		for i := 0; i < len(accs); i++ {
			recipient, _ = simtypes.RandomAcc(r, accs)
			badgeType = badgeTypes[r.Intn(len(badgeTypes))]
			_, err := k.UserBadge.Get(ctx, recipient.Address.String())
			if err != nil {
				found = true
				break
			}
		}

		if !found {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgIssueBadge{}), "no account available without badge"), nil, nil
		}

		msg := &types.MsgIssueBadge{
			Creator:   simAccount.Address.String(),
			Recipient: recipient.Address.String(),
			BadgeType: badgeType,
		}

		server := keeper.NewMsgServerImpl(k)
		_, err := server.IssueBadge(ctx, msg)
		if err != nil {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, "IssueBadge simulation completed successfully"), nil, nil
	}
}
