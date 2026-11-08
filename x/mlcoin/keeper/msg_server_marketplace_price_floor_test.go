package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	"marketplace/x/mlcoin/types"
)

// The direct MsgBuyMallcoin/MsgSellMallcoin paths adjust MarketPrice linearly
// (±1 cent per 1000 MLCN traded). Before this fix the sell path floored both
// prices at 1 cent, so a single sufficiently large sell could flatten MLCNS
// from 0.62 KES to 0.01 KES in one transaction, and repeated sells walked it
// there regardless of the "0.62 floor" rule the dynamic-pricing engine
// enforces. Both messages are broadcastable by any key holder (the backend
// does not call them, but nothing blocks them), so they must clamp to the same
// band as the engine: [base, base*1.5] = 62-93 buy, 58-87 sell.

func TestSellMallcoinCannotBreakBasePriceFloor(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{
		BuyPrice:  62,
		SellPrice: 58,
	}))

	seller := "marketplace1selloveruser1234567890abcdef"
	require.NoError(t, k.WalletBalance.Set(ctx, seller, types.WalletBalance{
		Address: seller,
		Balance: 10_000_000_000,
	}))

	msgSrv := keeper.NewMsgServerImpl(k)

	// priceChange = 10_000_000 / 1000 = 10_000 cents, vastly more than the
	// price itself. This single tx used to set both prices to 1 cent.
	_, err := msgSrv.SellMallcoin(sdk.WrapSDKContext(ctx), &types.MsgSellMallcoin{
		Seller:     seller,
		MlcnAmount: 10_000_000,
	})
	require.NoError(t, err)

	market, err := k.MarketPrice.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(62), market.BuyPrice, "MsgSellMallcoin must not break the 0.62 base floor")
	require.Equal(t, uint64(58), market.SellPrice, "MsgSellMallcoin must not break the 0.58 base floor")
}

func TestSellMallcoinRepeatedSellsStayInBand(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 93, SellPrice: 87}))

	seller := "marketplace1sellwalkuser1234567890abcdef"
	require.NoError(t, k.WalletBalance.Set(ctx, seller, types.WalletBalance{
		Address: seller,
		Balance: 2_000_000_000,
	}))

	msgSrv := keeper.NewMsgServerImpl(k)

	// Walk the price down with many moderate sells (priceChange = 5 cents each).
	for i := 0; i < 60; i++ {
		_, err := msgSrv.SellMallcoin(sdk.WrapSDKContext(ctx), &types.MsgSellMallcoin{
			Seller:     seller,
			MlcnAmount: 5_000,
		})
		require.NoError(t, err)
	}

	market, err := k.MarketPrice.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(62), market.BuyPrice)
	require.Equal(t, uint64(58), market.SellPrice)
}

func TestBuyMallcoinCannotBreakPriceCeiling(t *testing.T) {
	k, ctx := keeperWithDeps(t)

	require.NoError(t, k.MarketPrice.Set(ctx, types.MarketPrice{BuyPrice: 62, SellPrice: 58}))

	buyer := "marketplace1buyoveruser1234567890abcdef"
	// kesRequired = mlcn * buy price = 32_000 * 62, well under the 57,000,000
	// buy-side liquidity cap.
	require.NoError(t, k.KesBalance.Set(ctx, buyer, types.KesBalance{
		Address: buyer,
		Balance: 5_000_000,
	}))

	msgSrv := keeper.NewMsgServerImpl(k)

	_, err := msgSrv.BuyMallcoin(sdk.WrapSDKContext(ctx), &types.MsgBuyMallcoin{
		Buyer:      buyer,
		MlcnAmount: 32_000,
	})
	require.NoError(t, err)

	market, err := k.MarketPrice.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(93), market.BuyPrice, "MsgBuyMallcoin must not exceed the 1.5x ceiling")
	require.Equal(t, uint64(87), market.SellPrice, "MsgBuyMallcoin must not exceed the 1.5x ceiling")
}
