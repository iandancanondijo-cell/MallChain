package keeper

import (
	"context"

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