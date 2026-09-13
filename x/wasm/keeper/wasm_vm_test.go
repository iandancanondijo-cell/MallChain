package keeper_test

import (
	_ "embed"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	wasmkeeper "marketplace/x/wasm/keeper"
)

// echoWasm round-trips its input through the real "env" host storage
// functions: it writes the _execute message under key "k" via db_write,
// then reads it back via db_read and returns whatever comes back. See
// testdata/echo.wat for the source. Passing proves three things at once:
// the host correctly writes msg bytes into the contract's own memory
// (writeRegion + allocate), the imported db_write/db_read calls correctly
// resolve back to this contract's real, keeper-backed ContractState, and
// the host correctly reads the contract's real returned region.
//
//go:embed testdata/echo.wasm
var echoWasm []byte

// spinWasm calls a no-op function in a ~10^11-iteration loop and never
// calls back into the host again — a contract that would hold a
// validator's CPU hostage for a very long time if nothing bounded it. See
// testdata/spin.wat.
//
//go:embed testdata/spin.wasm
var spinWasm []byte

// noAllocateWasm exports _instantiate but deliberately no allocate — used
// to prove the VM fails clearly on a non-conformant contract instead of
// silently skipping input delivery. See testdata/noalloc.wat.
//
//go:embed testdata/noalloc.wasm
var noAllocateWasm []byte

func TestWasmVMHostStorageRoundTrip(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	sender := "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"

	codeID, err := k.StoreCode(ctx, echoWasm)
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, sender, codeID, "echo-test", []byte("{}"))
	require.NoError(t, err)

	// executeWASMRaw (reached through the "wasm_execute" action envelope)
	// passes the whole msg through to the contract's _execute.
	msg := []byte(`{"action":"wasm_execute","hello":"world"}`)
	result, err := k.ExecuteContract(ctx, sender, addr, msg)
	require.NoError(t, err)
	require.Equal(t, string(msg), result)

	// Confirms the round trip went through the real, keeper-backed
	// ContractState store (namespaced by contract address), not some
	// VM-internal-only buffer.
	stored, err := k.GetContractState(ctx, addr, "k")
	require.NoError(t, err)
	require.Equal(t, msg, stored)
}

func TestWasmVMGasAbortsRunawayContract(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	sender := "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"

	codeID, err := k.StoreCode(ctx, spinWasm)
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, sender, codeID, "spin-test", []byte("{}"))
	require.NoError(t, err)

	start := time.Now()
	_, err = k.ExecuteContract(ctx, sender, addr, []byte(`{"action":"wasm_execute"}`))
	elapsed := time.Since(start)

	// Must fail — a contract that never returns can't be treated as a
	// successful no-op — and must fail FAST: the whole point of real gas
	// metering plus the timeout backstop is that this returns in a bounded,
	// short window rather than actually completing ~10^11 loop iterations
	// or hanging for the request's full lifetime.
	require.Error(t, err)
	require.Less(t, elapsed, wasmkeeper.WasmExecutionTimeout*4, "runaway contract was not aborted promptly")
}

func TestWasmVMRejectsMissingAllocate(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	sender := "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"

	codeID, err := k.StoreCode(ctx, noAllocateWasm)
	require.NoError(t, err)

	_, err = k.InstantiateContract(ctx, sender, codeID, "no-allocate-test", []byte("{}"))
	require.Error(t, err)
	require.Contains(t, err.Error(), "allocate")
}
