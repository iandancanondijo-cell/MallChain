package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	"marketplace/x/mlcoin/types"
)

// Regression coverage: every real MLCNS movement in the app (fiat buys,
// Mallpoints conversions, campaign payouts, plain sends) broadcasts
// MsgTransferMallcoin, not MsgBuyMallcoin/MsgSellMallcoin — so unless this
// handler also calls RecordActivity, the dynamic-pricing engine
// (updateDynamicPricing in end_blocker.go) never sees any real usage and
// MLCNS's "dynamic" price never actually moves.
func TestTransferMallcoinRecordsActivity(t *testing.T) {
	f := initFixture(t)
	srv := keeper.NewMsgServerImpl(&f.keeper)
	sender := testAddr(0x30)
	recipient := testAddr(0x40)

	require.NoError(t, f.keeper.WalletBalance.Set(f.ctx, sender, types.WalletBalance{
		Address: sender,
		Balance: 1_000_000_000,
	}))

	before, err := f.keeper.ActivityMetrics.Get(f.ctx)
	if err != nil {
		before = types.ActivityMetrics{}
	}

	sdkCtx := f.ctx.(sdk.Context)
	wrapped := sdk.WrapSDKContext(sdkCtx)
	_, err = srv.TransferMallcoin(wrapped, &types.MsgTransferMallcoin{
		Creator: sender,
		To:      recipient,
		Amount:  100_000_000,
	})
	require.NoError(t, err)

	after, err := f.keeper.ActivityMetrics.Get(f.ctx)
	require.NoError(t, err)
	require.Greater(t, after.TotalTransactions, before.TotalTransactions)
	require.Greater(t, after.TotalVolume, before.TotalVolume)
	require.Equal(t, uint64(100_000_000), after.TotalVolume-before.TotalVolume)
}
