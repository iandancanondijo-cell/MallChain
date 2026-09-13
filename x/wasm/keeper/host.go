package keeper

import (
	"context"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"

	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

// ContractHostEnvironment provides chain interactions for WASM contracts
type ContractHostEnvironment struct {
	Ctx          context.Context
	ContractAddr string
	Sender       string
	Keeper       *Keeper
}

// GetSender returns the transaction sender
func (h *ContractHostEnvironment) GetSender() string {
	return h.Sender
}

// GetContractAddress returns the contract address
func (h *ContractHostEnvironment) GetContractAddress() string {
	return h.ContractAddr
}

// StorageGet reads from contract state
func (h *ContractHostEnvironment) StorageGet(key string) ([]byte, error) {
	return h.Keeper.GetContractState(h.Ctx, h.ContractAddr, key)
}

// StorageSet writes to contract state
func (h *ContractHostEnvironment) StorageSet(key string, value []byte) error {
	return h.Keeper.SetContractState(h.Ctx, h.ContractAddr, key, value)
}

// Mgp20Transfer transfers tokens on behalf of contract
func (h *ContractHostEnvironment) Mgp20Transfer(to string, amount uint64) error {
	transferMsg := wasmbridgetypes.MGP20TransferMsg{
		From:   h.ContractAddr,
		To:     to,
		Amount: amount,
	}
	return h.Keeper.wasmbridgeKeeper.HandleTransfer(h.Ctx, transferMsg)
}

// Mgp20QueryBalance queries token balance
func (h *ContractHostEnvironment) Mgp20QueryBalance(address string) (uint64, error) {
	return h.Keeper.wasmbridgeKeeper.QueryBalance(h.Ctx, address)
}

// HostABI provides the interface definition for WASM contracts
type HostABI struct {
	Functions map[string]FunctionSpec
}

type FunctionSpec struct {
	Name    string
	Params  []string
	Results []string
}

func DefaultHostABI() *HostABI {
	return &HostABI{
		Functions: map[string]FunctionSpec{
			"storage_get":     {Name: "storage_get", Params: []string{"key_ptr", "key_len"}, Results: []string{"ptr"}},
			"storage_set":     {Name: "storage_set", Params: []string{"key_ptr", "key_len", "value_ptr", "value_len"}, Results: []string{"success"}},
			"mgp20_transfer":  {Name: "mgp20_transfer", Params: []string{"to_ptr", "to_len", "amount"}, Results: []string{"success"}},
			"mgp20_balance":   {Name: "mgp20_balance", Params: []string{"address_ptr", "address_len"}, Results: []string{"balance"}},
		},
	}
}

// NewHostEnvironment creates a contract host environment for WASM execution
func NewHostEnvironment(ctx context.Context, contractAddr, sender string, keeper *Keeper) *ContractHostEnvironment {
	return &ContractHostEnvironment{
		Ctx:          ctx,
		ContractAddr: contractAddr,
		Sender:       sender,
		Keeper:       keeper,
	}
}

// buildHostModule registers this environment's methods as real wazero host
// imports under module name "env" — the piece that was previously entirely
// missing: DefaultHostABI() above documented an ABI that nothing ever wired
// up, so a contract importing "env"."db_read" etc. would simply fail to
// instantiate. WithGoModuleFunction (not the simpler WithGoFunction) is
// used because these host functions need direct access to the CALLING
// module's own linear memory (to read key/value bytes the contract passed
// by pointer, and — for db_read — to call back into the contract's own
// allocate() export to hand the result back), which only the calling
// module's api.Module gives access to.
func (h *ContractHostEnvironment) buildHostModule(ctx context.Context, runtime wazero.Runtime) (api.Module, error) {
	builder := runtime.NewHostModuleBuilder("env")

	builder.NewFunctionBuilder().
		WithGoModuleFunction(api.GoModuleFunc(func(_ context.Context, mod api.Module, stack []uint64) {
			keyPtr, keyLen := uint32(stack[0]), uint32(stack[1])
			valPtr, valLen := uint32(stack[2]), uint32(stack[3])
			key, ok := mod.Memory().Read(keyPtr, keyLen)
			if !ok {
				return
			}
			val, ok := mod.Memory().Read(valPtr, valLen)
			if !ok {
				return
			}
			_ = h.StorageSet(string(key), append([]byte(nil), val...))
		}), []api.ValueType{api.ValueTypeI32, api.ValueTypeI32, api.ValueTypeI32, api.ValueTypeI32}, nil).
		WithParameterNames("key_ptr", "key_len", "val_ptr", "val_len").
		Export("db_write")

	builder.NewFunctionBuilder().
		WithGoModuleFunction(api.GoModuleFunc(func(ctx context.Context, mod api.Module, stack []uint64) {
			keyPtr, keyLen := uint32(stack[0]), uint32(stack[1])
			key, ok := mod.Memory().Read(keyPtr, keyLen)
			if !ok {
				stack[0] = 0
				return
			}
			val, err := h.StorageGet(string(key))
			if err != nil || val == nil {
				stack[0] = 0
				return
			}
			ptr, err := writeRegion(ctx, mod, val)
			if err != nil {
				stack[0] = 0
				return
			}
			stack[0] = uint64(ptr)
		}), []api.ValueType{api.ValueTypeI32, api.ValueTypeI32}, []api.ValueType{api.ValueTypeI32}).
		WithParameterNames("key_ptr", "key_len").
		WithResultNames("region_ptr").
		Export("db_read")

	builder.NewFunctionBuilder().
		WithGoModuleFunction(api.GoModuleFunc(func(_ context.Context, mod api.Module, stack []uint64) {
			addrPtr, addrLen := uint32(stack[0]), uint32(stack[1])
			addr, ok := mod.Memory().Read(addrPtr, addrLen)
			if !ok {
				stack[0] = 0
				return
			}
			balance, err := h.Mgp20QueryBalance(string(addr))
			if err != nil {
				stack[0] = 0
				return
			}
			stack[0] = balance
		}), []api.ValueType{api.ValueTypeI32, api.ValueTypeI32}, []api.ValueType{api.ValueTypeI64}).
		WithParameterNames("addr_ptr", "addr_len").
		WithResultNames("balance").
		Export("get_balance")

	builder.NewFunctionBuilder().
		WithGoModuleFunction(api.GoModuleFunc(func(_ context.Context, mod api.Module, stack []uint64) {
			toPtr, toLen := uint32(stack[0]), uint32(stack[1])
			amount := stack[2]
			to, ok := mod.Memory().Read(toPtr, toLen)
			if !ok {
				stack[0] = 1
				return
			}
			if err := h.Mgp20Transfer(string(to), amount); err != nil {
				stack[0] = 1
				return
			}
			stack[0] = 0
		}), []api.ValueType{api.ValueTypeI32, api.ValueTypeI32, api.ValueTypeI64}, []api.ValueType{api.ValueTypeI32}).
		WithParameterNames("to_ptr", "to_len", "amount").
		WithResultNames("status").
		Export("transfer")

	return builder.Instantiate(ctx)
}