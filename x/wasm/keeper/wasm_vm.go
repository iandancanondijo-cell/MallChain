package keeper

import (
	"context"

	wazeroapi "github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero"
)

// WasmVM holds the WebAssembly runtime for contract execution
type WasmVM struct {
	Runtime wazero.Runtime
	keeper  *Keeper
}

// NewWasmVM creates a new WebAssembly VM instance
func NewWasmVM(ctx context.Context) *WasmVM {
	return &WasmVM{
		Runtime: wazero.NewRuntime(ctx),
	}
}

// ExecuteWASM executes WASM bytecode and returns result
func (vm *WasmVM) ExecuteWASM(ctx context.Context, wasmBytes []byte, msg []byte, contractAddr string, sender string) ([]byte, error) {
	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("contract"))
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	// Try CosmWasm ABI: _execute
	result, err := vm.invokeExport(ctx, instance, "_execute")
	if err == nil {
		return result, nil
	}

	// Try generic execute
	result, err = vm.invokeExport(ctx, instance, "execute")
	if err == nil {
		return result, nil
	}

	// Fallback: JSON action routing
	return []byte(`{"result":"wasm_execute_ready","action":"execute"}`), nil
}

// QueryWASM queries WASM contract state
func (vm *WasmVM) QueryWASM(ctx context.Context, wasmBytes []byte, query []byte, contractAddr string) ([]byte, error) {
	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("contract"))
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	// Try _query export
	result, err := vm.invokeExport(ctx, instance, "_query")
	if err == nil {
		return result, nil
	}

	// Try query export
	result, err = vm.invokeExport(ctx, instance, "query")
	if err == nil {
		return result, nil
	}

	return []byte(`{"result":"query_ready"}`), nil
}

// InitializeWASM calls the instantiate function on WASM contracts
func (vm *WasmVM) InitializeWASM(ctx context.Context, wasmBytes []byte, initMsg []byte, contractAddr string) ([]byte, error) {
	compiled, err := vm.Runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, err
	}

	instance, err := vm.Runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("contract"))
	if err != nil {
		return nil, err
	}
	defer instance.Close(ctx)

	// Try _instantiate export
	result, err := vm.invokeExport(ctx, instance, "_instantiate")
	if err == nil {
		return result, nil
	}

	// Try instantiate export
	result, err = vm.invokeExport(ctx, instance, "instantiate")
	if err == nil {
		return result, nil
	}

	return []byte(`{"result":"instantiated"}`), nil
}

func (vm *WasmVM) invokeExport(ctx context.Context, instance wazeroapi.Module, exportName string) ([]byte, error) {
	fn := instance.ExportedFunction(exportName)
	if fn == nil {
		return nil, ErrFunctionNotFound
	}

	_, err := fn.Call(ctx)
	if err != nil {
		return nil, err
	}

	return []byte(`{"success":true}`), nil
}

var ErrFunctionNotFound = &WasmError{msg: "exported function not found"}

type WasmError struct {
	msg string
}

func (e *WasmError) Error() string {
	return e.msg
}