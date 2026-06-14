package keeper

import (
	"context"
	"fmt"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const maxBuyKesLiquidity = 570000 * 100 // 570,000 KES scaled by 100

// TotalBuyKesKey is the key for caching the total KES bought across all trades.
// This avoids iterating the entire trade history on every buy.
var TotalBuyKesKey = []byte("totalBuyKesCache")

// getCachedTotalBuyKes returns the cached total KES purchased across all buy trades.
func (k msgServer) getCachedTotalBuyKes(ctx context.Context) (uint64, error) {
	store := k.storeService.OpenKVStore(ctx)
	bz, err := store.Get(TotalBuyKesKey)
	if err != nil {
		return 0, err
	}
	if bz == nil {
		// Migrate from iterating history (cold start)
		total, err := k.iterateTotalBuyKes(ctx)
		if err != nil {
			return 0, err
		}
		bz = make([]byte, 8)
		for i := 0; i < 8; i++ {
			bz[7-i] = byte(total >> (i * 8))
		}
		if err := store.Set(TotalBuyKesKey, bz); err != nil {
			return 0, err
		}
		return total, nil
	}
	var total uint64
	for i := 0; i < 8; i++ {
		total = (total << 8) | uint64(bz[i])
	}
	return total, nil
}

// addCachedTotalBuyKes atomically increments the cached total.
func (k msgServer) addCachedTotalBuyKes(ctx context.Context, delta uint64) error {
	current, err := k.getCachedTotalBuyKes(ctx)
	if err != nil {
		return err
	}
	newTotal, err := safeAdd(current, delta)
	if err != nil {
		return err
	}
	store := k.storeService.OpenKVStore(ctx)
	bz := make([]byte, 8)
	for i := 0; i < 8; i++ {
		bz[7-i] = byte(newTotal >> (i * 8))
	}
	return store.Set(TotalBuyKesKey, bz)
}

// subtractCachedTotalBuyKes atomically decrements the cached total.
func (k msgServer) subtractCachedTotalBuyKes(ctx context.Context, delta uint64) error {
	current, err := k.getCachedTotalBuyKes(ctx)
	if err != nil {
		return err
	}
	newTotal, err := safeSub(current, delta)
	if err != nil {
		return err
	}
	store := k.storeService.OpenKVStore(ctx)
	bz := make([]byte, 8)
	for i := 0; i < 8; i++ {
		bz[7-i] = byte(newTotal >> (i * 8))
	}
	return store.Set(TotalBuyKesKey, bz)
}

// iterateTotalBuyKes iterates all trade history to compute total KES bought.
// Used as a cold-start migration; use getCachedTotalBuyKes for live reads.
func (k msgServer) iterateTotalBuyKes(ctx context.Context) (uint64, error) {
	iter, err := k.TradeHistory.Iterate(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer iter.Close()

	var total uint64
	for ; iter.Valid(); iter.Next() {
		trade, err := iter.Value()
		if err != nil {
			return 0, err
		}
		if trade.TradeType == "buy" {
			newTotal, err := safeAdd(total, trade.KesAmount)
			if err != nil {
				return 0, errorsmod.Wrap(types.ErrInvalidRequest, "total buy KES overflow during migration")
			}
			total = newTotal
		}
	}
	return total, nil
}

// BuyMallcoin handles buying MLCN with KES
func (k msgServer) BuyMallcoin(ctx context.Context, msg *types.MsgBuyMallcoin) (*types.MsgBuyMallcoinResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// load market price (initialize defaults if missing)
	market, err := k.MarketPrice.Get(ctx)
	if err != nil {
		market = types.MarketPrice{
			BuyPrice:        62, // 0.62 KES
			SellPrice:       58, // 0.58 KES
			TotalBuyVolume:  0,
			TotalSellVolume: 0,
		}
	}

	mlcn := msg.MlcnAmount
	if mlcn == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "amount must be > 0")
	}

	// Overflow-safe: kes = mlcn * buy_price
	kesRequired, err := safeMul(mlcn, market.BuyPrice)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "kes required overflow")
	}

	// Enforce a hard buy-side liquidity cap for accumulated KES purchases (uses cached aggregate).
	currentKesBought, err := k.getCachedTotalBuyKes(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to compute buy-side liquidity")
	}
	newTotalKes, err := safeAdd(currentKesBought, kesRequired)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrLiquidityCapExceeded, "buy would overflow KES total")
	}
	if newTotalKes > maxBuyKesLiquidity {
		return nil, errorsmod.Wrap(types.ErrLiquidityCapExceeded, fmt.Sprintf("buy would exceed KES liquidity cap of %d (scaled by 100)", maxBuyKesLiquidity))
	}

	// get buyer KES balance
	kesBal, err := k.KesBalance.Get(ctx, msg.Buyer)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "buyer KES balance not found")
	}
	if kesBal.Balance < kesRequired {
		return nil, errorsmod.Wrap(types.ErrInsufficientBalance, "insufficient KES to buy MLCN")
	}

	// Overflow-safe KES deduction
	newKesBal, err := safeSub(kesBal.Balance, kesRequired)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "KES balance underflow")
	}
	kesBal.Balance = newKesBal
	if err := k.KesBalance.Set(ctx, msg.Buyer, kesBal); err != nil {
		return nil, err
	}

	// mint MLCN to buyer (use guarded minting)
	if err := k.Keeper.WithMintingEnabled(ctx, func() error { return k.Keeper.MintToWallet(ctx, msg.Buyer, mlcn) }); err != nil {
		return nil, err
	}

	// update market volumes and prices (simple linear adjustment)
	newBuyVolume, err := safeAdd(market.TotalBuyVolume, mlcn)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "buy volume overflow")
	}
	market.TotalBuyVolume = newBuyVolume

	// price change: +1 cent per 1000 MLCN bought (minimum 1)
	priceChange := mlcn / 1000
	if priceChange == 0 {
		priceChange = 1
	}
	newBuyPrice, err := safeAdd(market.BuyPrice, priceChange)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "buy price overflow")
	}
	market.BuyPrice = newBuyPrice

	newSellPrice, err := safeAdd(market.SellPrice, priceChange)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "sell price overflow")
	}
	market.SellPrice = newSellPrice

	market.LastUpdateHeight = uint64(sdkCtx.BlockHeight())
	if err := k.MarketPrice.Set(ctx, market); err != nil {
		return nil, err
	}

	// Update cached total KES bought
	if err := k.addCachedTotalBuyKes(ctx, kesRequired); err != nil {
		return nil, err
	}

	// record trade
	seq, err := k.TransactionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to get trade sequence")
	}
	tradeID := fmt.Sprintf("TR-%d", seq)
	trade := types.Trade{
		TxId:        tradeID,
		Trader:      msg.Buyer,
		TradeType:   "buy",
		MlcnAmount:  mlcn,
		KesAmount:   kesRequired,
		Price:       market.BuyPrice,
		Timestamp:   sdkCtx.BlockTime().Unix(),
		BlockHeight: uint64(sdkCtx.BlockHeight()),
	}
	if err := k.TradeHistory.Set(ctx, tradeID, trade); err != nil {
		return nil, err
	}

	// Record activity metrics for dynamic pricing — surface error for observability
	if err := k.Keeper.RecordActivity(ctx, "buy", mlcn, msg.Buyer); err != nil {
		sdkCtx.Logger().Info("buy activity recording failed (buy succeeded)", "buyer", msg.Buyer, "amount", mlcn, "error", err)
	}

	// Accumulate trading fees — surface error for observability
	if err := k.Keeper.AccumulateFees(ctx, "buy", mlcn); err != nil {
		sdkCtx.Logger().Info("buy fee accumulation failed (buy succeeded)", "buyer", msg.Buyer, "amount", mlcn, "error", err)
	}

	return &types.MsgBuyMallcoinResponse{TradeId: tradeID, KesPaid: kesRequired, Price: market.BuyPrice}, nil
}

// SellMallcoin handles selling MLCN for KES
func (k msgServer) SellMallcoin(ctx context.Context, msg *types.MsgSellMallcoin) (*types.MsgSellMallcoinResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// load market price
	market, err := k.MarketPrice.Get(ctx)
	if err != nil {
		market = types.MarketPrice{BuyPrice: 62, SellPrice: 58}
	}

	mlcn := msg.MlcnAmount
	if mlcn == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "amount must be > 0")
	}

	// check seller balance - the < check ensures no underflow risk on deduction
	wallet, err := k.WalletBalance.Get(ctx, msg.Seller)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrWalletNotFound, "seller wallet not found")
	}
	if wallet.Balance < mlcn {
		return nil, errorsmod.Wrap(types.ErrInsufficientBalance, "insufficient MLCN to sell")
	}

	// Overflow-safe: kes = mlcn * sell_price
	kesToCredit, err := safeMul(mlcn, market.SellPrice)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "KES to credit overflow")
	}

	// deduct MLCN from seller
	newBalance, err := safeSub(wallet.Balance, mlcn)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "seller MLCN balance underflow")
	}
	wallet.Balance = newBalance
	if err := k.WalletBalance.Set(ctx, msg.Seller, wallet); err != nil {
		return nil, err
	}

	// reduce circulating supply
	emission, err := k.EmissionState.Get(ctx)
	if err == nil {
		newCirc, err := safeSub(emission.Circulating, mlcn)
		if err == nil {
			emission.Circulating = newCirc
			if err := k.EmissionState.Set(ctx, emission); err != nil {
				sdkCtx.Logger().Info("failed to update circulating supply on sell", "seller", msg.Seller, "error", err)
			}
		}
	}

	// credit KES to seller
	kesBal, err := k.KesBalance.Get(ctx, msg.Seller)
	if err != nil {
		kesBal = types.KesBalance{Address: msg.Seller, Balance: 0}
	}
	newKesBal, err := safeAdd(kesBal.Balance, kesToCredit)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "KES balance overflow on credit")
	}
	kesBal.Balance = newKesBal
	if err := k.KesBalance.Set(ctx, msg.Seller, kesBal); err != nil {
		return nil, err
	}

	// update market
	newSellVolume, err := safeAdd(market.TotalSellVolume, mlcn)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "sell volume overflow")
	}
	market.TotalSellVolume = newSellVolume

	priceChange := mlcn / 1000
	if priceChange == 0 {
		priceChange = 1
	}
	if market.BuyPrice > priceChange {
		market.BuyPrice -= priceChange
	} else {
		market.BuyPrice = 1
	}
	if market.SellPrice > priceChange {
		market.SellPrice -= priceChange
	} else {
		market.SellPrice = 1
	}
	market.LastUpdateHeight = uint64(sdkCtx.BlockHeight())
	if err := k.MarketPrice.Set(ctx, market); err != nil {
		return nil, err
	}

	// Update cached total KES bought (sell reduces it)
	if err := k.subtractCachedTotalBuyKes(ctx, kesToCredit); err != nil {
		sdkCtx.Logger().Info("failed to update cached buy KES on sell (non-fatal)", "seller", msg.Seller, "error", err)
	}

	// record trade
	seq, err := k.TransactionCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to get trade sequence")
	}
	tradeID := fmt.Sprintf("TR-%d", seq)
	trade := types.Trade{
		TxId:        tradeID,
		Trader:      msg.Seller,
		TradeType:   "sell",
		MlcnAmount:  mlcn,
		KesAmount:   kesToCredit,
		Price:       market.SellPrice,
		Timestamp:   sdkCtx.BlockTime().Unix(),
		BlockHeight: uint64(sdkCtx.BlockHeight()),
	}
	if err := k.TradeHistory.Set(ctx, tradeID, trade); err != nil {
		return nil, err
	}

	// Record activity metrics — surface error
	if err := k.Keeper.RecordActivity(ctx, "sell", mlcn, msg.Seller); err != nil {
		sdkCtx.Logger().Info("sell activity recording failed (sell succeeded)", "seller", msg.Seller, "error", err)
	}

	// Accumulate trading fees — surface error
	if err := k.Keeper.AccumulateFees(ctx, "sell", mlcn); err != nil {
		sdkCtx.Logger().Info("sell fee accumulation failed (sell succeeded)", "seller", msg.Seller, "error", err)
	}

	// Record transaction on-chain for the sell (seller -> system) — surface error
	if _, err := k.Keeper.RecordTransaction(ctx, msg.Seller, "system", mlcn, "sell", "Sold to marketplace"); err != nil {
		sdkCtx.Logger().Info("sell transaction recording failed (sell succeeded)", "seller", msg.Seller, "error", err)
	}

	return &types.MsgSellMallcoinResponse{TradeId: tradeID, KesReceived: kesToCredit, Price: market.SellPrice}, nil
}

// SetCurrencyRate sets a currency rate to KES (admin)
func (k msgServer) SetCurrencyRate(ctx context.Context, msg *types.MsgSetCurrencyRate) (*types.MsgSetCurrencyRateResponse, error) {
	// Allow manual setting only when submitted by module authority (e.g., governance).
	// Extract authority string from keeper and compare to message authority.
	authStr, err := k.Keeper.addressCodec.BytesToString(k.Keeper.GetAuthority())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrUnauthorized, "invalid module authority")
	}
	if msg.Authority != authStr {
		return nil, errorsmod.Wrap(types.ErrUnauthorized, "only module authority may set currency rates")
	}

	// Persist the provided rate
	rate := types.CurrencyRate{
		Currency:  msg.Currency,
		RateToKes: msg.RateToKes,
	}
	if err := k.Keeper.CurrencyRates.Set(ctx, msg.Currency, rate); err != nil {
		return nil, err
	}

	return &types.MsgSetCurrencyRateResponse{}, nil
}
