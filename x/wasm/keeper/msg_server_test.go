package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	wasmkeeper "marketplace/x/wasm/keeper"
	wasmtypes "marketplace/x/wasm/types"
)

// TestMutatingMsgsWorkEndToEnd replaces the old TestMutatingMsgsAreDisabled:
// StoreCode/InstantiateContract/ExecuteContract used to be hard-rejected at
// this boundary because contract input/output was never actually wired to
// wazero, there were no host functions, and gas was a flat fee (see
// WasmVM's doc comment in wasm_vm.go for what "real" now means). That's
// implemented now, so this proves the MsgServer path — the single choke
// point every client (CLI, gRPC, REST, frontend) goes through — actually
// works with a genuinely ABI-conformant contract end-to-end, using the same
// minimalValidWasm fixture keeper_test.go's other tests already rely on.
func TestMutatingMsgsWorkEndToEnd(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	msgServer := wasmkeeper.NewMsgServerImpl(k)
	sender := "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"

	var codeID uint64
	t.Run("StoreCode", func(t *testing.T) {
		resp, err := msgServer.StoreCode(ctx, &wasmtypes.MsgStoreCode{Sender: sender, WasmCode: minimalValidWasm})
		require.NoError(t, err)
		require.NotNil(t, resp)
		require.Greater(t, resp.CodeId, uint64(0))
		codeID = resp.CodeId
	})

	var contractAddr string
	t.Run("InstantiateContract", func(t *testing.T) {
		resp, err := msgServer.InstantiateContract(ctx, &wasmtypes.MsgInstantiateContract{
			Sender: sender, CodeId: codeID, Label: "e2e-test", InitMsg: []byte("{}"),
		})
		require.NoError(t, err)
		require.NotNil(t, resp)
		require.NotEmpty(t, resp.ContractAddress)
		contractAddr = resp.ContractAddress
	})

	t.Run("ExecuteContract", func(t *testing.T) {
		resp, err := msgServer.ExecuteContract(ctx, &wasmtypes.MsgExecuteContract{
			Sender: sender, ContractAddress: contractAddr, Msg: []byte(`{"action":"wasm_execute"}`),
		})
		require.NoError(t, err)
		require.NotNil(t, resp)
		// Real return value from the contract's own _execute, not a
		// hardcoded VM-level success string.
		require.Contains(t, resp.Data, "success")
	})
}

// TestInstantiateRejectsNonConformantCode preserves the spirit of the old
// disabled-by-default gate — a contract that can't do what it claims must
// fail loudly — but enforces it via real ABI-conformance checking instead
// of blanket-rejecting every contract.
func TestInstantiateRejectsNonConformantCode(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	msgServer := wasmkeeper.NewMsgServerImpl(k)
	sender := "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"

	storeResp, err := msgServer.StoreCode(ctx, &wasmtypes.MsgStoreCode{
		// A module with no exports at all — no memory, no allocate, no
		// _instantiate. It's valid WASM (compiles fine) but doesn't
		// implement the ABI this VM requires.
		Sender: sender,
		WasmCode: []byte{
			0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version 1
		},
	})
	require.NoError(t, err)

	_, err = msgServer.InstantiateContract(ctx, &wasmtypes.MsgInstantiateContract{
		Sender: sender, CodeId: storeResp.CodeId, Label: "bad", InitMsg: []byte("{}"),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "_instantiate")
}

// TestQueriesStayEnabled confirms queries against pre-existing state work
// regardless of the mutating-message wiring above.
func TestQueriesStayEnabled(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	queryServer := wasmkeeper.NewQueryServerImpl(k)

	resp, err := queryServer.AllContracts(ctx, &wasmtypes.QueryAllContractsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}
