package simulation

import (
	"math/rand"

	"cosmossdk.io/math"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"marketplace/x/dex/keeper"
	"marketplace/x/dex/types"
)

func SimulateMsgSwap(
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		pools, err := k.GetAllPools(ctx)
		if err != nil || len(pools) == 0 {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(&types.MsgSwap{}), "no pools available"), nil, nil
		}

		pool := pools[r.Intn(len(pools))]

		sender, _ := simtypes.RandomAcc(r, accs)

		var tokenIn sdk.Coin
		var tokenOutDenom string
		if r.Intn(2) == 0 {
			tokenIn = pool.TokenAReserve
			tokenOutDenom = pool.TokenBDenom
		} else {
			tokenIn = pool.TokenBReserve
			tokenOutDenom = pool.TokenADenom
		}

		amount := uint64(1)
		if tokenIn.Amount.Uint64() > 1 {
			amount = uint64(r.Int63n(int64(tokenIn.Amount.Uint64()))) + 1
		}
		tokenIn = sdk.NewCoin(tokenIn.Denom, math.NewIntFromUint64(amount))

		minTokenOut := sdk.NewCoin(tokenOutDenom, math.NewInt(0))

		msg := &types.MsgSwap{
			Sender:        sender.Address.String(),
			PoolId:        pool.Id,
			TokenIn:       tokenIn,
			TokenOutDenom: tokenOutDenom,
			MinTokenOut:   minTokenOut,
		}

		server := keeper.NewMsgServerImpl(k)
		_, err = server.Swap(ctx, msg)
		if err != nil {
			return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, "Swap simulation completed successfully"), nil, nil
	}
}
