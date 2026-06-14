package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"
)

// GetMarketPrice returns current market buy/sell prices
func (q queryServer) GetMarketPrice(ctx context.Context, req *types.QueryGetMarketPriceRequest) (*types.QueryGetMarketPriceResponse, error) {
	market, err := q.k.MarketPrice.Get(ctx)
	if err != nil {
		// return defaults if not set
		m := types.MarketPrice{BuyPrice: 62, SellPrice: 58}
		return &types.QueryGetMarketPriceResponse{MarketPrice: m}, nil
	}
	return &types.QueryGetMarketPriceResponse{MarketPrice: market}, nil
}

// GetKesBalance returns user's KES balance
func (q queryServer) GetKesBalance(ctx context.Context, req *types.QueryGetKesBalanceRequest) (*types.QueryGetKesBalanceResponse, error) {
	kes, err := q.k.KesBalance.Get(ctx, req.Address)
	if err != nil {
		return nil, types.ErrInvalidRequest
	}
	return &types.QueryGetKesBalanceResponse{KesBalance: kes}, nil
}

// GetTradeHistory returns trade history
func (q queryServer) GetTradeHistory(ctx context.Context, req *types.QueryGetTradeHistoryRequest) (*types.QueryGetTradeHistoryResponse, error) {
	var trades []types.Trade
	err := q.k.TradeHistory.Walk(ctx, nil, func(key string, value types.Trade) (stop bool, err error) {
		trades = append(trades, value)
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	return &types.QueryGetTradeHistoryResponse{Trades: trades}, nil
}

// GetCurrencyRates returns all stored currency rates
func (q queryServer) GetCurrencyRates(ctx context.Context, req *types.QueryGetCurrencyRatesRequest) (*types.QueryGetCurrencyRatesResponse, error) {
	var rates []*types.CurrencyRate
	err := q.k.CurrencyRates.Walk(ctx, nil, func(key string, value types.CurrencyRate) (stop bool, err error) {
		v := value
		rates = append(rates, &v)
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	return &types.QueryGetCurrencyRatesResponse{CurrencyRates: rates}, nil
}
