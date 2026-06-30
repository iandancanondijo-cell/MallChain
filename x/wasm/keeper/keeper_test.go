package keeper_test

import (
	"context"
	"testing"

	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	storetypes "cosmossdk.io/store/types"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	wasmkeeper "marketplace/x/wasm/keeper"
	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

type mockWasmBridgeKeeper struct{}

func (m mockWasmBridgeKeeper) HandleTransfer(ctx context.Context, msg wasmbridgetypes.MGP20TransferMsg) error {
	return nil
}
func (m mockWasmBridgeKeeper) HandleApprove(ctx context.Context, msg wasmbridgetypes.MGP20ApproveMsg) error {
	return nil
}
func (m mockWasmBridgeKeeper) QueryBalance(ctx context.Context, address string) (uint64, error) {
	return 1000, nil
}

func newWasmTestKeeper(t *testing.T) (wasmkeeper.Keeper, sdk.Context) {
	t.Helper()
	storeKey := storetypes.NewKVStoreKey("wasm")
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	k, err := wasmkeeper.NewKeeper(
		storeService,
		codec.NewProtoCodec(nil),
		mockWasmBridgeKeeper{},
	)
	require.NoError(t, err)

	return k, ctx
}

func TestStoreCode(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	assert.NoError(t, err)
	assert.Greater(t, codeID, uint64(0))

	code, err := k.GetCode(ctx, codeID)
	assert.NoError(t, err)
	assert.Equal(t, []byte("mock wasm code"), code)
}

func TestInstantiateContract(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	assert.NoError(t, err)
	assert.NotEmpty(t, addr)

	contract, err := k.GetContract(ctx, addr)
	assert.NoError(t, err)
	assert.Equal(t, "test-contract", contract.Label)
	assert.Equal(t, uint64(codeID), contract.CodeID)
}

func TestContractState(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	err = k.SetContractState(ctx, addr, "key1", []byte("value1"))
	assert.NoError(t, err)

	val, err := k.GetContractState(ctx, addr, "key1")
	assert.NoError(t, err)
	assert.Equal(t, []byte("value1"), val)

	val2, err := k.GetContractState(ctx, addr, "nonexistent")
	assert.NoError(t, err)
	assert.Nil(t, val2)
}

func TestExecuteContractTransfer(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	msg := []byte(`{"action":"transfer","to":"cosmos1wfjkx6tsd9jkuazlv9jxgun9wde47h6lta047h6lta047hc8xlsu7","amount":100}`)
	result, err := k.ExecuteContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", addr, msg)
	assert.NoError(t, err)
	assert.Equal(t, "transfer_executed", result)
}

func TestExecuteContractApprove(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	msg := []byte(`{"action":"approve","spender":"cosmos1wdcx2mnyv4e97ctyv3ex2umnta047h6lta047h6lta0shqw8nw","amount":50}`)
	result, err := k.ExecuteContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", addr, msg)
	assert.NoError(t, err)
	assert.Equal(t, "approve_executed", result)
}

func TestExecuteContractUnauthorized(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	msg := []byte(`{"action":"wasm_execute","data":"mock"}`)
	_, err = k.ExecuteContract(ctx, "cosmos1da6xsetjtaskgerjv4ehxh6lta047h6lta047h6le85ad4", addr, msg)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not authorized")
}

func TestQueryContract(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	resp, err := k.QueryContract(ctx, addr, []byte(`{"query":"owner"}`))
	assert.NoError(t, err)
	assert.Contains(t, string(resp), "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685")

	resp, err = k.QueryContract(ctx, addr, []byte(`{"query":"balance","address":"cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685"}`))
	assert.NoError(t, err)
	assert.Contains(t, string(resp), "1000")
}

func TestGetAllContracts(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	contracts, err := k.GetAllContracts(ctx)
	assert.NoError(t, err)
	assert.Empty(t, contracts)

	for i := 0; i < 3; i++ {
		codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
		require.NoError(t, err)
		_, err = k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
		require.NoError(t, err)
	}

	contracts, err = k.GetAllContracts(ctx)
	assert.NoError(t, err)
	assert.Len(t, contracts, 3)
}

func TestGenerateContractAddress(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	addr1, err := k.GenerateContractAddress(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685")
	assert.NoError(t, err)
	assert.NotEmpty(t, addr1)

	addr2, err := k.GenerateContractAddress(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685")
	assert.NoError(t, err)
	assert.NotEmpty(t, addr2)
	assert.NotEqual(t, addr1, addr2)
}

// minimalValidWasm is a hand-crafted WASM module that exports an empty `_execute` function.
// Compiled bytecode verified against wazero v1.x.
var minimalValidWasm = []byte{
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version 1
	0x01, 0x04, 0x01, 0x60, 0x00, 0x00,                // type section: 1 func type () -> ()
	0x03, 0x02, 0x01, 0x00,                            // function section: 1 func, type 0
	0x07, 0x0c, 0x01, 0x08,                            // export section
	'_', 'e', 'x', 'e', 'c', 'u', 't', 'e',            //   name: "_execute"
	0x00, 0x00,                                        //   export func index 0
	0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,                // code section: 1 body, 0 locals, end
}

func TestWasmVMIntegration(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	// Store real (minimal) WASM bytecode
	codeID, err := k.StoreCode(ctx, minimalValidWasm)
	require.NoError(t, err)
	require.Greater(t, codeID, uint64(0))

	// Verify code is stored correctly
	stored, err := k.GetCode(ctx, codeID)
	require.NoError(t, err)
	assert.Equal(t, minimalValidWasm, stored)

	// Instantiate contract with the real WASM code
	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "vm-test", []byte("{}"))
	require.NoError(t, err)
	assert.NotEmpty(t, addr)

	// Execute the contract via WASM VM
	msg := []byte(`{"action":"wasm_execute"}`)
	result, err := k.ExecuteContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", addr, msg)
	require.NoError(t, err)
	assert.Contains(t, string(result), "success")

	// Query the contract (owner query doesn't require WASM VM)
	resp, err := k.QueryContract(ctx, addr, []byte(`{"query":"owner"}`))
	require.NoError(t, err)
	assert.Contains(t, string(resp), "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685")
}

func TestWasmVMEmptyCodeRejected(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	// Empty bytecode should be rejected by validation
	_, err := k.StoreCode(ctx, []byte{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestAuthorizeAction(t *testing.T) {
	k, ctx := newWasmTestKeeper(t)

	codeID, err := k.StoreCode(ctx, []byte("mock wasm code"))
	require.NoError(t, err)

	addr, err := k.InstantiateContract(ctx, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", codeID, "test-contract", []byte("{}"))
	require.NoError(t, err)

	err = k.AuthorizeAction(ctx, addr, "cosmos1wdjkuer9wf0kzerywfjhxu6lta047h6lta047h6ltukxm685", "transfer")
	assert.NoError(t, err)

	err = k.AuthorizeAction(ctx, addr, "cosmos1other", "transfer")
	assert.NoError(t, err)

	err = k.AuthorizeAction(ctx, addr, "cosmos1other", "unknown_action")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not authorized")
}
