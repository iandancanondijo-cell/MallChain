package simulation

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"marketplace/x/mlcoin/keeper"
	"marketplace/x/mlcoin/types"
)

func SimulateMsgTransferMallcoin(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		var sender simtypes.Account
		var senderWallet types.WalletBalance
		var err error
		var found bool

		for i := 0; i < len(accs); i++ {
			sender, _ = simtypes.RandomAcc(r, accs)
			senderWallet, err = k.WalletBalance.Get(ctx, sender.Address.String())
			if err == nil && senderWallet.Balance > 0 {
				found = true
				break
			}
		}

		if !found {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgTransferMallcoin{}), "no account with sufficient balance"), nil, nil
		}

		recipient, _ := simtypes.RandomAcc(r, accs)
		if recipient.Address.String() == sender.Address.String() {
			recipient, _ = simtypes.RandomAcc(r, accs)
		}

		amount := uint64(1)
		if senderWallet.Balance > 1 {
			amount = uint64(r.Int63n(int64(senderWallet.Balance))) + 1
		}

		msg := &types.MsgTransferMallcoin{
			Creator: sender.Address.String(),
			Amount:  amount,
			To:      recipient.Address.String(),
		}

		server := keeper.NewMsgServerImpl(&k)
		_, err = server.TransferMallcoin(ctx, msg)
		if err != nil {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, "TransferMallcoin simulation completed successfully"), nil, nil
	}
}
