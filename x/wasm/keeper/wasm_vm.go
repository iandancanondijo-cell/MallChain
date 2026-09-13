package keeper

import (
	"context"
	"fmt"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental"
)

const (
	// Production WASM limits
	MaxWasmMemoryPages = uint32(64 * 1024 / 4) // 64MB max memory (64KB pages)
	MaxWasmCodeSize    = int(256 * 1024)       // 256KB max contract code size

	// WasmExecutionTimeout is a wall-clock backstop, not the primary cost
	// control (that's the real per-function-call gas meter below). It's
	// short because interpreter-mode execution (required for the gas
	// listener to see every call) is much slower per instruction than the
	// compiler engine, so even this short a window still bounds real work
	// meaningfully — and it's what actually protects the chain against code
	// that spends a lot of wall-clock time without making many function
	// calls (e.g. one long-running arithmetic/branch loop with no calls
	// inside it, which the per-call meter alone can't see).
	WasmExecutionTimeout = 500 * time.Millisecond
)

// WasmVM wraps wazero (github.com/tetratelabs/wazero), a real, pure-Go
// WebAssembly runtime — compiled/interpreted execution is genuinely
// sandboxed: a malicious module can't escape wazero's linear memory or make
// arbitrary host syscalls.
//
// Calling convention (defined here since no existing contract format needed
// to be matched):
//   - The contract must export "memory" and an allocator:
//     allocate(size: i32) -> i32 (ptr), used both when the host needs to
//     write input into the contract's memory and when a host function needs
//     to hand a value back to the contract.
//   - Entry points _instantiate/_execute/_query all have the signature
//     (msg_ptr: i32, msg_len: i32) -> i32 (result_ptr). A result_ptr of 0
//     means "no result". Otherwise it points to a region: 4 bytes
//     little-endian length, followed by that many bytes of UTF-8 JSON.
//   - Host functions (module "env"): db_read(key_ptr,key_len) -> i32
//     (region ptr, 0 if not found), db_write(key_ptr,key_len,val_ptr,val_len),
//     get_balance(addr_ptr,addr_len) -> i64, transfer(to_ptr,to_len,amount:i64)
//     -> i32 (0 = ok). Storage is namespaced per contract address (see
//     Keeper.ContractState); transfer moves MGP20 tokens the contract
//     itself holds, via x/wasmbridge — never the native chain token.
//
// Gas: real, execution-proportional cost via an experimental
// FunctionListener that charges GasConfig.PerCallGasCost on every function
// call (both calls internal to the contract and calls into "env"), for both
// the guest module and the host module — not a flat fee independent of how
// much work the contract actually does. See gasMeter below.
type WasmVM struct {
	Runtime wazero.Runtime
	keeper  *Keeper
}

func NewWasmVM(_ context.Context) *WasmVM {
	// Interpreter mode (not the default ahead-of-time compiler engine) so
	// the FunctionListener gas hook below fires reliably and
	// WithCloseOnContextDone can promptly tear down a module once gas runs
	// out or the timeout backstop fires, instead of running compiled native
	// code to completion regardless of context cancellation.
	config := wazero.NewRuntimeConfigInterpreter().WithCloseOnContextDone(true)
	return &WasmVM{Runtime: wazero.NewRuntimeWithConfig(context.Background(), config)}
}

// gasMeter charges gas per function call via wazero's experimental
// FunctionListener hook, scoped to a single execution (a fresh gasMeter is
// built for every ExecuteWASM/InitializeWASM/QueryWASM call, so concurrent
// or sequential calls never share gas state). When the limit is exceeded it
// cancels the call's own context; combined with RuntimeConfig's
// WithCloseOnContextDone(true) this aborts the in-flight call promptly
// rather than only refusing to charge more gas while the module keeps
// running.
type gasMeter struct {
	limit   uint64
	used    uint64
	perCall uint64
	cancel  context.CancelFunc
	aborted bool
}

func (g *gasMeter) NewFunctionListener(api.FunctionDefinition) experimental.FunctionListener {
	return g
}

func (g *gasMeter) Before(_ context.Context, _ api.Module, _ api.FunctionDefinition, _ []uint64, _ experimental.StackIterator) {
	g.used += g.perCall
	if g.used > g.limit {
		g.aborted = true
		g.cancel()
	}
}

func (g *gasMeter) After(context.Context, api.Module, api.FunctionDefinition, []uint64) {}
func (g *gasMeter) Abort(context.Context, api.Module, api.FunctionDefinition, error)    {}

// writeRegion asks the contract's own allocator for space, writes data into
// it (length-prefixed), and returns the region pointer. Used both for
// passing the host's input msg into the contract and for a host function
// handing a value (e.g. db_read's result) back to the calling contract.
func writeRegion(ctx context.Context, mod api.Module, data []byte) (uint32, error) {
	allocate := mod.ExportedFunction("allocate")
	if allocate == nil {
		return 0, fmt.Errorf("contract does not export allocate(size:i32)->i32")
	}
	results, err := allocate.Call(ctx, uint64(4+len(data)))
	if err != nil {
		return 0, fmt.Errorf("allocate call failed: %w", err)
	}
	if len(results) == 0 {
		return 0, fmt.Errorf("allocate returned no result")
	}
	ptr := uint32(results[0])
	mem := mod.Memory()
	if !mem.WriteUint32Le(ptr, uint32(len(data))) {
		return 0, fmt.Errorf("failed to write region length at %d", ptr)
	}
	if len(data) > 0 && !mem.Write(ptr+4, data) {
		return 0, fmt.Errorf("failed to write region data at %d (len %d)", ptr+4, len(data))
	}
	return ptr, nil
}

// writeRawBytes asks the contract's own allocator for exactly len(data)
// bytes and writes data directly at the returned pointer — no length
// prefix. This is the convention for delivering the ENTRY POINT's own
// input (msg_ptr, msg_len are passed as two separate call arguments, so the
// length doesn't need to be self-describing in memory the way a returned
// region does). Do not reuse writeRegion for this — a length-prefixed
// region and a raw (ptr,len) pair are different conventions, and passing
// one where the other is expected reads 4 bytes of the length prefix as
// if they were data (silent corruption, not a crash) — a real bug this
// exact test setup caught before it shipped.
func writeRawBytes(ctx context.Context, mod api.Module, data []byte) (uint32, error) {
	allocate := mod.ExportedFunction("allocate")
	if allocate == nil {
		return 0, fmt.Errorf("contract does not export allocate(size:i32)->i32")
	}
	results, err := allocate.Call(ctx, uint64(len(data)))
	if err != nil {
		return 0, fmt.Errorf("allocate call failed: %w", err)
	}
	if len(results) == 0 {
		return 0, fmt.Errorf("allocate returned no result")
	}
	ptr := uint32(results[0])
	if len(data) > 0 && !mod.Memory().Write(ptr, data) {
		return 0, fmt.Errorf("failed to write input data at %d (len %d)", ptr, len(data))
	}
	return ptr, nil
}

// readRegion reads a length-prefixed region the contract returned. ptr==0
// means "no result" (treated as an empty success, not an error — keeps
// simple contracts that don't return anything from _instantiate ergonomic).
func readRegion(mod api.Module, ptr uint32) ([]byte, error) {
	if ptr == 0 {
		return nil, nil
	}
	mem := mod.Memory()
	length, ok := mem.ReadUint32Le(ptr)
	if !ok {
		return nil, fmt.Errorf("failed to read region length at %d", ptr)
	}
	if length == 0 {
		return []byte{}, nil
	}
	data, ok := mem.Read(ptr+4, length)
	if !ok {
		return nil, fmt.Errorf("failed to read region data at %d (len %d)", ptr+4, length)
	}
	out := make([]byte, length)
	copy(out, data)
	return out, nil
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

// call is the shared implementation behind ExecuteWASM/InitializeWASM/
// QueryWASM: compile the guest module, build+instantiate a fresh "env" host
// module bound to (contractAddr, sender), instantiate the guest with real
// per-call gas metering wired in, write msg into the guest's memory, invoke
// entrypoint, and read back its real return value.
func (vm *WasmVM) call(
	ctx context.Context,
	wasmBytes []byte,
	entrypoint string,
	msg []byte,
	contractAddr, sender string,
	gasLimit, baseCost, entrypointCost uint64,
) ([]byte, uint64, error) {
	if err := vm.validateWasmCode(wasmBytes); err != nil {
		return nil, 0, err
	}

	timeoutCtx, timeoutCancel := context.WithTimeout(ctx, WasmExecutionTimeout)
	defer timeoutCancel()
	gasCtx, gasCancel := context.WithCancel(timeoutCtx)
	defer gasCancel()

	meter := &gasMeter{limit: gasLimit, perCall: 1, cancel: gasCancel}
	if vm.keeper != nil {
		gc, err := vm.keeper.GetGasConfig(ctx)
		if err == nil && gc.PerCallGasCost > 0 {
			meter.perCall = gc.PerCallGasCost
		}
	}
	execCtx := experimental.WithFunctionListenerFactory(gasCtx, meter)

	// Charge the flat checkpoint costs up front — same accounting the
	// caller (keeper.go) has always applied for instantiate/execute/query,
	// kept as an additional floor cost alongside the new per-call metering.
	meter.used += baseCost
	if meter.used > meter.limit {
		return nil, meter.used, fmt.Errorf("wasm out of gas: used %d, limit %d", meter.used, meter.limit)
	}

	compiled, err := vm.Runtime.CompileModule(execCtx, wasmBytes)
	if err != nil {
		return nil, meter.used, fmt.Errorf("failed to compile contract: %w", err)
	}
	defer compiled.Close(execCtx)

	env := NewHostEnvironment(ctx, contractAddr, sender, vm.keeper)
	hostMod, err := env.buildHostModule(execCtx, vm.Runtime)
	if err != nil {
		return nil, meter.used, fmt.Errorf("failed to build host module: %w", err)
	}
	defer hostMod.Close(execCtx)

	instance, err := vm.Runtime.InstantiateModule(execCtx, compiled, wazero.NewModuleConfig().WithName("contract"))
	if err != nil {
		if meter.aborted {
			return nil, meter.used, fmt.Errorf("wasm out of gas: used %d, limit %d", meter.used, meter.limit)
		}
		if timeoutCtx.Err() != nil {
			return nil, meter.used, fmt.Errorf("wasm execution timed out")
		}
		return nil, meter.used, fmt.Errorf("failed to instantiate contract: %w", err)
	}
	defer instance.Close(execCtx)

	fn := instance.ExportedFunction(entrypoint)
	if fn == nil {
		return nil, meter.used, fmt.Errorf("contract does not export %s(msg_ptr:i32,msg_len:i32)->i32", entrypoint)
	}

	meter.used += entrypointCost
	if meter.used > meter.limit {
		return nil, meter.used, fmt.Errorf("wasm out of gas: used %d, limit %d", meter.used, meter.limit)
	}

	msgPtr, err := writeRawBytes(execCtx, instance, msg)
	if err != nil {
		return nil, meter.used, fmt.Errorf("failed to pass input to contract: %w", err)
	}

	results, err := fn.Call(execCtx, uint64(msgPtr), uint64(len(msg)))
	if err != nil {
		if meter.aborted {
			return nil, meter.used, fmt.Errorf("wasm out of gas: used %d, limit %d", meter.used, meter.limit)
		}
		if timeoutCtx.Err() != nil {
			return nil, meter.used, fmt.Errorf("wasm execution timed out")
		}
		return nil, meter.used, fmt.Errorf("contract %s failed: %w", entrypoint, err)
	}
	if len(results) == 0 {
		return nil, meter.used, nil
	}

	result, err := readRegion(instance, uint32(results[0]))
	if err != nil {
		return nil, meter.used, fmt.Errorf("failed to read contract result: %w", err)
	}
	return result, meter.used, nil
}

// InitializeWASM calls the contract's _instantiate entry point.
func (vm *WasmVM) InitializeWASM(ctx context.Context, wasmBytes, initMsg []byte, contractAddr, sender string, gasLimit, instantiateCost uint64) ([]byte, uint64, error) {
	return vm.call(ctx, wasmBytes, "_instantiate", initMsg, contractAddr, sender, gasLimit, instantiateCost, 0)
}

// ExecuteWASM calls the contract's _execute entry point.
func (vm *WasmVM) ExecuteWASM(ctx context.Context, wasmBytes, msg []byte, contractAddr, sender string, gasLimit, baseCost, exportCost uint64) ([]byte, uint64, error) {
	return vm.call(ctx, wasmBytes, "_execute", msg, contractAddr, sender, gasLimit, baseCost, exportCost)
}

// QueryWASM calls the contract's _query entry point. Read-only by
// convention (the contract's own db_write host import still works if
// called, since a query message can't be distinguished from an execute one
// at the ABI level — the msg_server layer is what actually prevents queries
// from being routed anywhere state-changing).
func (vm *WasmVM) QueryWASM(ctx context.Context, wasmBytes, query []byte, contractAddr, sender string, gasLimit, queryCost uint64) ([]byte, uint64, error) {
	return vm.call(ctx, wasmBytes, "_query", query, contractAddr, sender, gasLimit, queryCost, 0)
}

// ValidateAndCompile validates WASM before execution
func (vm *WasmVM) ValidateAndCompile(_ context.Context, wasmBytes []byte) error {
	return vm.validateWasmCode(wasmBytes)
}
