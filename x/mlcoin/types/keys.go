package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "mlcoin"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	// It should be synced with the gov module's name if it is ever changed.
	// See: https://github.com/cosmos/cosmos-sdk/blob/v0.52.0-beta.2/x/gov/types/keys.go#L9
	GovModuleName = "gov"
)

// TreasurySnapshotKey is the key for storing the latest treasury snapshot
var TreasurySnapshotKey = []byte("treasury_snapshot")

// ParamsKey is the prefix to retrieve all Params
var ParamsKey = collections.NewPrefix("p_mlcoin_params")

var (
	EmissionStateKey    = collections.NewPrefix("emissionState/value/")
	TransactionKey      = collections.NewPrefix("transaction/value/")
	TransactionCountKey = collections.NewPrefix("transaction/count/")
	MarketPriceKey      = collections.NewPrefix("marketPrice/value/")
	KesBalanceKey       = collections.NewPrefix("kesBalance/value/")
	TradeHistoryKey     = collections.NewPrefix("tradeHistory/value/")
	CurrencyRateKey     = collections.NewPrefix("currencyRate/value/")
	ActivityMetricsKey  = collections.NewPrefix("activityMetrics/value/")
	FeesAccumulatedKey  = collections.NewPrefix("feesAccumulated/value/")
	AllowanceKey        = collections.NewPrefix("allowance/value/")

	// Staking storage keys
	StakingInfoKey     = collections.NewPrefix("staking/info/")
	StakingSequenceKey = collections.NewPrefix("staking/sequence/")
)
