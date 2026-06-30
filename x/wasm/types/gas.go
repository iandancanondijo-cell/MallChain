package types

// Gas costs for WASM operations (configurable via module params).
type GasConfig struct {
	DefaultGasLimit   uint64 `json:"default_gas_limit"`
	InstantiateCost   uint64 `json:"instantiate_cost"`
	ExecuteBaseCost   uint64 `json:"execute_base_cost"`
	ExecuteExportCost uint64 `json:"execute_export_cost"`
	QueryCost         uint64 `json:"query_cost"`
}

func DefaultGasConfig() GasConfig {
	return GasConfig{
		DefaultGasLimit:   100_000,
		InstantiateCost:   20_000,
		ExecuteBaseCost:   10_000,
		ExecuteExportCost: 50_000,
		QueryCost:         5_000,
	}
}
