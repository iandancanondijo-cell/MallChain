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

func SimulateMsgStake(
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		var sender simtypes.Account
		var senderWallet types.WalletBalance
		var found bool

		for i := 0; i < len(accs); i++ {
			sender, _ = simtypes.RandomAcc(r, accs)
			senderWallet, err := k.WalletBalance.Get(ctx, sender.Address.String())
			if err == nil && senderWallet.Balance > types.DefaultMinStakeAmount {
				found = true
				break
			}
		}

		if !found {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgStake{}), "no account with sufficient balance to stake"), nil, nil
		}

		maxStake := senderWallet.Balance / 2
		if maxStake < types.DefaultMinStakeAmount {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgStake{}), "insufficient balance for minimum stake"), nil, nil
		}

		stakeAmount := uint64(r.Int63n(int64(maxStake-types.DefaultMinStakeAmount+1))) + types.DefaultMinStakeAmount

		msg := &types.MsgStake{
			Creator: sender.Address.String(),
			Amount:  stakeAmount,
		}

		server := keeper.NewMsgServerImpl(&k)
		_, err := server.Stake(ctx, msg)
		if err != nil {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, "Stake simulation completed successfully"), nil, nil
	}
}
