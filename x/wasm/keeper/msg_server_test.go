package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	wasmkeeper "marketplace/x/wasm/keeper"
	wasmtypes "marketplace/x/wasm/types"
)

// TestMutatingMsgsAreDisabled locks in the deliberate production gate: x/wasm's
// contract execution never actually wires msg/query/init bytes to the wazero
// instance, always returns a hardcoded success result, and has no host
// functions or per-instruction gas metering (see WasmVM's doc comment in
// wasm_vm.go). Until that's built, StoreCode/InstantiateContract/ExecuteContract
// must be rejected at the MsgServer boundary — the single choke point every
// client (CLI, gRPC, REST, frontend) goes through — rather than silently
// accepting "contracts" that can't do what they claim.
func TestMutatingMsgsAreDisabled(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	msgServer := wasmkeeper.NewMsgServerImpl(k)

	t.Run("StoreCode", func(t *testing.T) {
		resp, err := msgServer.StoreCode(ctx, &wasmtypes.MsgStoreCode{Sender: "mall1abc", WasmCode: []byte("code")})
		require.Nil(t, resp)
		require.ErrorIs(t, err, wasmtypes.ErrModuleDisabled)
	})

	t.Run("InstantiateContract", func(t *testing.T) {
		resp, err := msgServer.InstantiateContract(ctx, &wasmtypes.MsgInstantiateContract{Sender: "mall1abc", CodeId: 1})
		require.Nil(t, resp)
		require.ErrorIs(t, err, wasmtypes.ErrModuleDisabled)
	})

	t.Run("ExecuteContract", func(t *testing.T) {
		resp, err := msgServer.ExecuteContract(ctx, &wasmtypes.MsgExecuteContract{Sender: "mall1abc", ContractAddress: "mall1contract"})
		require.Nil(t, resp)
		require.ErrorIs(t, err, wasmtypes.ErrModuleDisabled)
	})
}

// TestQueriesStayEnabled confirms the gate is scoped to the state-mutating
// msgs only — read-only queries against pre-existing state must keep working.
func TestQueriesStayEnabled(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)
	queryServer := wasmkeeper.NewQueryServerImpl(k)

	resp, err := queryServer.AllContracts(ctx, &wasmtypes.QueryAllContractsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
}
