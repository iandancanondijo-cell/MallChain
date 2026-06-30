package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	"marketplace/x/wasm/keeper"
	"marketplace/x/wasm/types"
)

// minimalValidWasm is a hand-crafted WASM module that exports an empty _execute function.
var minimalValidWasmVM = []byte{
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version 1
	0x01, 0x04, 0x01, 0x60, 0x00, 0x00,                // type section: 1 func type () -> ()
	0x03, 0x02, 0x01, 0x00,                            // function section: 1 func, type 0
	0x07, 0x0c, 0x01, 0x08,                            // export section
	'_', 'e', 'x', 'e', 'c', 'u', 't', 'e',            //   name: "_execute"
	0x00, 0x00,                                        //   export func index 0
	0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,                // code section: 1 body, 0 locals, end
}

func TestWasmVMNew(t *testing.T) {
	vm := keeper.NewWasmVM(nil)
	require.NotNil(t, vm)
	assert.Equal(t, uint64(0), vm.GasUsed())
}

func TestWasmVMValidateWASM(t *testing.T) {
	vm := keeper.NewWasmVM(nil)

	// Valid WASM should pass validation
	err := vm.ValidateAndCompile(nil, minimalValidWasmVM)
	assert.NoError(t, err)

	// Empty bytecode should be rejected
	err = vm.ValidateAndCompile(nil, []byte{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestWasmErrorsAreWrap(t *testing.T) {
	err := types.ErrCodeNotFound.Wrap("not found")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
	assert.Contains(t, err.Error(), "code not found")
}

func TestEventTypeConstants(t *testing.T) {
	assert.Equal(t, "wasm_instantiate", types.EventTypeInstantiate)
	assert.Equal(t, "wasm_execute", types.EventTypeExecute)
	assert.Equal(t, "wasm_transfer", types.EventTypeTransfer)
	assert.Equal(t, "wasm_approve", types.EventTypeApprove)
}