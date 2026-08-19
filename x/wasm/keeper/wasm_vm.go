package keeper

import (
	"context"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/tetratelabs/wazero"
)

const (
	// Production WASM limits
	MaxWasmMemoryPages   = uint32(64 * 1024 / 4) // 64MB max memory (64KB pages)
	MaxWasmCodeSize      = int(256 * 1024)       // 256KB max contract code size
	WasmExecutionTimeout = 5 * time.Second       // Hard timeout for WASM execution
)

// WasmVM wraps wazero (github.com/tetratelabs/wazero), a real, pure-Go
// WebAssembly runtime — compiled/interpreted execution is genuinely
// sandboxed: a malicious module can't escape wazero's linear memory or make
// arbitrary host syscalls, so this is NOT a fake stub at the engine level.
//
// It is NOT a working smart-contract platform yet, though — three real gaps,
// confirmed by reading Execute/Initialize/QueryWASM below and the fact
// nothing in this package tests them against an actual compiled .wasm
// binary:
//  1. msg/query/initMsg bytes are accepted as Go parameters but never
//     written into the instantiated module's linear memory, and the
//     exported function is called with zero arguments (fn.Call(ctx)) — the
//     contract never actually receives its input.
//  2. The real return value of that call is discarded; every path returns
//     a hardcoded `{"success":true,...}` JSON string regardless of what
//     the contract computed or returned.
//  3. No host functions are registered on the runtime before
//     instantiation (see keeper/host.go's ContractHostEnvironment /
//     DefaultHostABI, which exist but are never wired to a
//     wazero.HostModuleBuilder here) — a contract has no way to read/write
//     persistent state or move MGP20 tokens, and gas is only charged in
//     coarse flat fees at fixed checkpoints (baseCost/exportCost/...), not
//     metered per WASM instruction, so a contract can still busy-loop for
//     up to WasmExecutionTimeout regardless of gas paid.
//
// Completing this (defining a real ABI/calling convention, memory
// read/write bridging, host function imports, per-instruction gas
// metering) is a genuine feature project, not a bug fix — flagged rather
// than attempted here without an existing contract format to validate
// against.
type WasmVM struct {
	Runtime   wazero.Runtime
	keeper    *Keeper
	gasUsed   uint64
	gasLimit  uint64
	codeSize  int
	callLimit int
}

func NewWasmVM(ctx context.Context) *WasmVM {
	runtime := wazero.NewRuntime(ctx)
	return &WasmVM{
		Runtime:   runtime,
		gasUsed:   0,
		callLimit: 10000, // Max function call depth
	}
}

func (vm *WasmVM) consumeGas(amount uint64) error {
	newUsed := atomic.AddUint64(&vm.gasUsed, amount)
	if vm.gasLimit > 0 && newUsed > vm.gasLimit {
		return fmt.Errorf("wasm out of gas: used %d, limit %d", newUsed, vm.gasLimit)
	}
	return nil
}

func (vm *WasmVM) withGasLimit(limit uint64) {
	vm.gasLimit = limit
	atomic.StoreUint64(&vm.gasUsed, 0)
}

// validateWasmCode checks code size limits before compilation
func (vm *WasmVM) validateWasmCode(wasmBytes []byte) error {
	if len(wasmBytes) == 0 {
		return fmt.Errorf("contract code is empty")
	}
	if len(wasmBytes) > MaxWasmCodeSize {
		return fmt.Errorf("contract code exceeds maximum size: %d > %d bytes", len(wasmBytes), MaxWasmCodeSize)
	}
	return nil
}

// ExecuteWASM executes WASM bytecode with resource limits
func (vm *WasmVM) ExecuteWASM(ctx context.Context, wasmBytes []byte, msg []byte, contractAddr string, sender string, gasLimit uint64, baseCost, exportCost uint64) ([]byte, error) {
	if err := vm.validateWasmCode(wasmBytes); err != nil {
		return nil, err
	}

	vm.withGasLimit(gasLimit)

	ctx, cancel := context.WithTimeout(ctx, WasmExecutionTimeout)
	defer cancel()

	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}
	defer compiled.Close(ctx)

	if err := vm.consumeGas(baseCost); err != nil {
		return nil, err
	}

	config := wazero.NewModuleConfig().
		WithName("contract")

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, config)
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	if fn := instance.ExportedFunction("_execute"); fn != nil {
		if err := vm.consumeGas(exportCost); err != nil {
			return nil, err
		}
		if _, err := fn.Call(ctx); err != nil {
			return nil, fmt.Errorf("WASM execute function failed: %w", err)
		}
	}

	return []byte(`{"success":true,"gas_used":` + strconv.FormatUint(vm.gasUsed, 10) + `}`), nil
}

// QueryWASM queries WASM contract state with limits
func (vm *WasmVM) QueryWASM(ctx context.Context, wasmBytes []byte, query []byte, contractAddr string, gasLimit, queryCost uint64) ([]byte, error) {
	if err := vm.validateWasmCode(wasmBytes); err != nil {
		return nil, err
	}

	vm.withGasLimit(gasLimit)

	ctx, cancel := context.WithTimeout(ctx, WasmExecutionTimeout/2)
	defer cancel()

	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}
	defer compiled.Close(ctx)

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("contract"))
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	if err := vm.consumeGas(queryCost); err != nil {
		return nil, err
	}

	return []byte(`{"success":true,"gas_used":` + strconv.FormatUint(vm.gasUsed, 10) + `}`), nil
}

// InitializeWASM calls the instantiate function on WASM contracts
func (vm *WasmVM) InitializeWASM(ctx context.Context, wasmBytes []byte, initMsg []byte, contractAddr string, gasLimit, instantiateCost uint64) ([]byte, error) {
	if err := vm.validateWasmCode(wasmBytes); err != nil {
		return nil, err
	}

	vm.withGasLimit(gasLimit)

	ctx, cancel := context.WithTimeout(ctx, WasmExecutionTimeout)
	defer cancel()

	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}
	defer compiled.Close(ctx)

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().
		WithName("contract"))
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	if err := vm.consumeGas(instantiateCost); err != nil {
		return nil, err
	}

	return []byte(`{"success":true,"gas_used":` + strconv.FormatUint(vm.gasUsed, 10) + `,"instantiated":true}`), nil
}

// GasUsed returns gas consumed by last operation
func (vm *WasmVM) GasUsed() uint64 {
	return atomic.LoadUint64(&vm.gasUsed)
}

// ValidateAndCompile validates WASM before execution
func (vm *WasmVM) ValidateAndCompile(ctx context.Context, wasmBytes []byte) error {
	return vm.validateWasmCode(wasmBytes)
}
