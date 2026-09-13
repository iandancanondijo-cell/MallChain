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
	Intervals     collections.Item[types.ModuleIntervals]
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

	// TreasurySnapshots is keyed by block height so entries are naturally
	// ordered chronologically; RecordTreasurySnapshot (end_blocker.go) prunes
	// old entries so this stays bounded.
	TreasurySnapshots collections.Map[int64, types.TreasurySnapshot]

	// EmissionMonthAnchor caches the absolute calendar month (year*12+month)
	// observed the first time updateEmissionSchedule runs, so the halving
	// schedule can be indexed by months-since-that-point instead of feeding
	// GetMonthlyEmission a raw absolute calendar month (which produced a
	// phase shift far past 64 bits and zeroed the emission rate forever).
	EmissionMonthAnchor collections.Item[uint64]
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
		Intervals:     collections.NewItem(sb, collections.NewPrefix("p_mlcoin_intervals"), "intervals", collections.NewJSONValueCodec[types.ModuleIntervals]()),
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

		TreasurySnapshots: collections.NewMap(sb, types.TreasurySnapshotsKey, "treasury_snapshots", collections.Int64Key, codec.CollValue[types.TreasurySnapshot](cdc)),

		EmissionMonthAnchor: collections.NewItem(sb, collections.NewPrefix("p_mlcoin_emission_anchor"), "emissionMonthAnchor", collections.Uint64Value),
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

// GetConversionRatio returns the governance-authoritative
// Mallpoints (MLPTS) -> Mallcoin (MLCNS) conversion ratio used by
// MsgConvertMallpoints on both sides of the chain/backend boundary.
// This is the single source of truth — the backend REST handlers
// fetch the same value via /mlcoin/v1/params so the client preview
// matches on-chain settlement. Returns safe compiled defaults if
// Params is corrupt or unset.
//
// Formula (implemented identically on Go and JS sides):
//
//	mlcnsAmount = (pointsAmount * mlptsPerMlcns) / scale
//
// where both mlptsPerMlcns and scale are uint64s.
func (k *Keeper) GetConversionRatio(ctx context.Context) (mlptsPerMlcns uint64, scale uint64) {
	p, err := k.Params.Get(ctx)
	if err != nil || p.MlptsPerMlcns == 0 {
		return types.DefaultMlptsPerMlcns, types.MLPTSPerMlcnsScale
	}
	return p.MlptsPerMlcns, types.MLPTSPerMlcnsScale
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}
