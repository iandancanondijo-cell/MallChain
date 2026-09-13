package types

// Gas costs for WASM operations (configurable via module params).
type GasConfig struct {
	DefaultGasLimit   uint64 `json:"default_gas_limit"`
	InstantiateCost   uint64 `json:"instantiate_cost"`
	ExecuteBaseCost   uint64 `json:"execute_base_cost"`
	ExecuteExportCost uint64 `json:"execute_export_cost"`
	QueryCost         uint64 `json:"query_cost"`
	// PerCallGasCost is charged on every WASM function call — both calls
	// internal to the contract and calls into a host import — via an
	// experimental.FunctionListener hook (see wasm_vm.go). This is real,
	// execution-proportional metering, unlike the flat checkpoint fees
	// above alone, which don't scale with how much work a contract
	// actually does once it starts running.
	PerCallGasCost uint64 `json:"per_call_gas_cost"`
}

func DefaultGasConfig() GasConfig {
	return GasConfig{
		DefaultGasLimit:   100_000,
		InstantiateCost:   20_000,
		ExecuteBaseCost:   10_000,
		ExecuteExportCost: 50_000,
		QueryCost:         5_000,
		PerCallGasCost:    10,
	}
}
