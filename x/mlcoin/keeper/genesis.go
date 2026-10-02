package keeper

import (
	"context"
	"errors"

	"marketplace/x/mlcoin/types"

	"cosmossdk.io/collections"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	for _, elem := range genState.WalletBalanceMap {
		if err := k.WalletBalance.Set(ctx, elem.Index, elem); err != nil {
			return err
		}
	}
	// initialize KES balances from genesis
	for _, kb := range genState.KesBalanceMap {
		if err := k.KesBalance.Set(ctx, kb.Address, kb); err != nil {
			return err
		}
	}
	if genState.EmissionState != nil {
		if err := k.EmissionState.Set(ctx, *genState.EmissionState); err != nil {
			return err
		}
	}

	// Initialize FeesAccumulated from genesis or use default
	feesAcc := genState.FeesAccumulated
	if feesAcc.TransactionFees == 0 && feesAcc.TradingFees == 0 && feesAcc.ConversionFees == 0 {
		feesAcc = types.FeesAccumulated{
			TransactionFees:      0,
			TradingFees:          0,
			ConversionFees:       0,
			LastDistributionTime: 0,
		}
	}
	if err := k.FeesAccumulated.Set(ctx, feesAcc); err != nil {
		return err
	}

	// Initialize transactions from genesis
	for _, tx := range genState.TransactionMap {
		if err := k.Transactions.Set(ctx, tx.TxId, tx); err != nil {
			return err
		}
	}

	// Initialize transaction count sequence
	if genState.TransactionCount > 0 {
		if err := k.TransactionCount.Set(ctx, genState.TransactionCount); err != nil {
			return err
		}
	}

	// Initialize market price from genesis
	if genState.MarketPrice != nil {
		if err := k.MarketPrice.Set(ctx, *genState.MarketPrice); err != nil {
			return err
		}
	}

	// Initialize trade history from genesis
	for _, trade := range genState.TradeHistory {
		if err := k.TradeHistory.Set(ctx, trade.TxId, trade); err != nil {
			return err
		}
	}

	if err := k.Params.Set(ctx, genState.Params); err != nil {
		return err
	}
	return k.initIntervals(ctx)
}

func (k Keeper) initIntervals(ctx context.Context) error {
	if _, err := k.Intervals.Get(ctx); err == nil {
		return nil
	}
	return k.Intervals.Set(ctx, types.DefaultModuleIntervals())
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	var err error

	// start with an empty genesis state so we only export on-chain data
	genesis := &types.GenesisState{}
	genesis.Params, err = k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}
	if err := k.WalletBalance.Walk(ctx, nil, func(_ string, val types.WalletBalance) (stop bool, err error) {
		genesis.WalletBalanceMap = append(genesis.WalletBalanceMap, val)
		return false, nil
	}); err != nil {
		return nil, err
	}
	emissionState, err := k.EmissionState.Get(ctx)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}
	genesis.EmissionState = &emissionState

	feesAcc, err := k.FeesAccumulated.Get(ctx)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}
	genesis.FeesAccumulated = feesAcc

	// Export transactions
	if err := k.Transactions.Walk(ctx, nil, func(_ string, val types.Transaction) (stop bool, err error) {
		genesis.TransactionMap = append(genesis.TransactionMap, val)
		return false, nil
	}); err != nil {
		return nil, err
	}

	// Export transaction count sequence (Peek returns next value without incrementing)
	txCount, err := k.TransactionCount.Peek(ctx)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}
	genesis.TransactionCount = txCount

	// Export market price
	marketPrice, err := k.MarketPrice.Get(ctx)
	if err != nil && !errors.Is(err, collections.ErrNotFound) {
		return nil, err
	}
	genesis.MarketPrice = &marketPrice

	// Export KES balances
	if err := k.KesBalance.Walk(ctx, nil, func(_ string, val types.KesBalance) (stop bool, err error) {
		genesis.KesBalanceMap = append(genesis.KesBalanceMap, val)
		return false, nil
	}); err != nil {
		return nil, err
	}

	// Export trade history
	if err := k.TradeHistory.Walk(ctx, nil, func(_ string, val types.Trade) (stop bool, err error) {
		genesis.TradeHistory = append(genesis.TradeHistory, val)
		return false, nil
	}); err != nil {
		return nil, err
	}

	return genesis, nil
}
