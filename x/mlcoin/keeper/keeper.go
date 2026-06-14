package keeper

import (
	"context"
	"fmt"
	"sync/atomic"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"marketplace/x/mlcoin/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	// external keepers
	authKeeper types.AuthKeeper
	bankKeeper types.BankKeeper

	Schema        collections.Schema
	Params        collections.Item[types.Params]
	WalletBalance collections.Map[string, types.WalletBalance]
	// Accounts collection removed; use the standard AuthKeeper for account/state
	EmissionState    collections.Item[types.EmissionState]
	Transactions     collections.Map[string, types.Transaction]
	TransactionCount collections.Sequence
	MarketPrice      collections.Item[types.MarketPrice]
	KesBalance       collections.Map[string, types.KesBalance]
	TradeHistory     collections.Map[string, types.Trade]
	CurrencyRates    collections.Map[string, types.CurrencyRate]
	ActivityMetrics  collections.Item[types.ActivityMetrics]
	FeesAccumulated  collections.Item[types.FeesAccumulated]
	Allowances       collections.Map[string, uint64]
	// internal minting guard (atomic flag to avoid mutexes in on-chain code)
	internalMinting int32

	// staking records
	StakingRecords  collections.Map[string, types.StakingInfo]
	StakingSequence collections.Sequence
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,

	authKeeper types.AuthKeeper,
	bankKeeper types.BankKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		authority:    authority,
		authKeeper:   authKeeper,
		bankKeeper:   bankKeeper,

		Params:        collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		WalletBalance: collections.NewMap(sb, types.WalletBalanceKey, "walletBalance", collections.StringKey, codec.CollValue[types.WalletBalance](cdc)),
		Allowances:    collections.NewMap(sb, types.AllowanceKey, "allowances", collections.StringKey, collections.Uint64Value),
		// Accounts collection removed; account management is handled by AuthKeeper
		EmissionState:    collections.NewItem(sb, types.EmissionStateKey, "emissionState", codec.CollValue[types.EmissionState](cdc)),
		Transactions:     collections.NewMap(sb, types.TransactionKey, "transactions", collections.StringKey, codec.CollValue[types.Transaction](cdc)),
		TransactionCount: collections.NewSequence(sb, types.TransactionCountKey, "transactionCount"),
		MarketPrice:      collections.NewItem(sb, types.MarketPriceKey, "marketPrice", codec.CollValue[types.MarketPrice](cdc)),
		KesBalance:       collections.NewMap(sb, types.KesBalanceKey, "kesBalance", collections.StringKey, codec.CollValue[types.KesBalance](cdc)),
		TradeHistory:     collections.NewMap(sb, types.TradeHistoryKey, "tradeHistory", collections.StringKey, codec.CollValue[types.Trade](cdc)),
		CurrencyRates:    collections.NewMap(sb, types.CurrencyRateKey, "currencyRate", collections.StringKey, codec.CollValue[types.CurrencyRate](cdc)),
		ActivityMetrics:  collections.NewItem(sb, types.ActivityMetricsKey, "activityMetrics", codec.CollValue[types.ActivityMetrics](cdc)),
		FeesAccumulated:  collections.NewItem(sb, types.FeesAccumulatedKey, "feesAccumulated", codec.CollValue[types.FeesAccumulated](cdc)),
		internalMinting:  0,
		StakingRecords:   collections.NewMap(sb, types.StakingInfoKey, "staking_records", collections.StringKey, codec.CollValue[types.StakingInfo](cdc)),
		StakingSequence:  collections.NewSequence(sb, types.StakingSequenceKey, "staking_sequence"),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// WithMintingEnabled runs the provided function with internal minting enabled.
// This is a minimal guard so that only code paths that explicitly opt-in
// can call MintToWallet. It is NOT a replacement for a proper RBAC
// persisted in params/genesis; implement that in follow-ups.
func (k *Keeper) WithMintingEnabled(ctx context.Context, fn func() error) error {
	atomic.StoreInt32(&k.internalMinting, 1)
	defer atomic.StoreInt32(&k.internalMinting, 0)

	return fn()
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}
