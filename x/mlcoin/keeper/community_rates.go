package keeper

import (
	"math"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/mlcoin/types"
)

// UpdateCurrencyRatesFromCommunity computes a community-driven adjustment to
// all stored currency rates based on recent trade activity (buys vs sells)
// in a recent block window. This is a simple, on-chain algorithm that
// nudges FX rates proportionally to the net-buy signal observed.
func (k Keeper) UpdateCurrencyRatesFromCommunity(ctx sdk.Context) {
	// configuration (tunable)
	const epochBlocks int64 = 1000 // window in blocks to consider
	const alpha float64 = 0.10     // maximum relative adjustment magnitude

	current := ctx.BlockHeight()
	var windowStart uint64 = 0
	if current > epochBlocks {
		windowStart = uint64(current - epochBlocks)
	}

	var totalBuy uint64
	var totalSell uint64

	// Aggregate buy/sell volumes from trade history within the window
	_ = k.TradeHistory.Walk(ctx, nil, func(_ string, t types.Trade) (stop bool, err error) {
		if t.BlockHeight >= windowStart {
			if t.TradeType == "buy" {
				totalBuy += t.MlcnAmount
			} else if t.TradeType == "sell" {
				totalSell += t.MlcnAmount
			}
		}
		return false, nil
	})

	totalActivity := totalBuy + totalSell
	if totalActivity == 0 {
		// nothing to do
		return
	}

	net := float64(int64(totalBuy) - int64(totalSell))
	r := net / float64(totalActivity) // -1..1

	// For each stored currency rate, apply a small proportional adjustment
	_ = k.CurrencyRates.Walk(ctx, nil, func(curr string, cr types.CurrencyRate) (stop bool, err error) {
		old := float64(cr.RateToKes)
		newf := old * (1.0 + alpha*r)
		if newf < 1.0 {
			newf = 1.0
		}
		cr.RateToKes = uint64(math.Round(newf))
		cr.LastUpdated = uint64(current)
		_ = k.CurrencyRates.Set(ctx, curr, cr)
		return false, nil
	})
}
