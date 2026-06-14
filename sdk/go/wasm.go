// Package mallchain provides Go SDK for Mallchain smart contract interactions
//
// Usage:
//   client, _ := mallchain.NewWasmClient("https://rpc.mallchain.com")
//   codeId, _ := client.StoreCode(wasmBytecode, senderAddr)
//   contractAddr, _ := client.Instantiate(codeId, initMsg, senderAddr, "my-contract")
//   result, _ := client.Execute(contractAddr, execMsg, senderAddr)
package mallchain

import (
	"context"
	"encoding/json"
)

// WasmClient provides smart contract interaction methods
type WasmClient struct {
	RpcUrl string
	Signer Signer
}

// Signer handles transaction signing
type Signer interface {
	SignAndBroadcast(ctx context.Context, msgs []MsgWasm, fee Fee) (TxResponse, error)
}

// MsgWasm represents a WASM message
type MsgWasm interface {
	MsgName() string
}

// MsgStoreCode stores WASM bytecode
type MsgStoreCode struct {
	WasmCode []byte `json:"wasm_code"`
	Sender   string `json:"sender"`
}

func (m *MsgStoreCode) MsgName() string { return "wasm/MsgStoreCode" }

// MsgInstantiateContract instantiates a WASM contract
type MsgInstantiateContract struct {
	Sender          string          `json:"sender"`
	CodeID          uint64          `json:"code_id"`
	Label           string          `json:"label,omitempty"`
	InitMsg         json.RawMessage `json:"init_msg"`
	GasLimit        uint64          `json:"gas_limit,omitempty"`
}

func (m *MsgInstantiateContract) MsgName() string { return "wasm/MsgInstantiateContract" }

// MsgExecuteContract executes a WASM contract
type MsgExecuteContract struct {
	Sender          string          `json:"sender"`
	ContractAddress string          `json:"contract_address"`
	Msg             json.RawMessage `json:"msg"`
	GasLimit        uint64          `json:"gas_limit,omitempty"`
}

func (m *MsgExecuteContract) MsgName() string { return "wasm/MsgExecuteContract" }

// Fee represents transaction fees
type Fee struct {
	Gas    uint64 `json:"gas"`
	Amount Coins  `json:"amount"`
}

// Coins represents token amounts
type Coins []Coin

type Coin struct {
	Denom  string `json:"denom"`
	Amount string `json:"amount"`
}

// TxResponse represents transaction response
type TxResponse struct {
	TxHash    string          `json:"txhash"`
	Code      uint32          `json:"code"`
	Data      json.RawMessage `json:"data"`
	Events    []Event         `json:"events"`
	GasUsed   uint64          `json:"gas_used"`
	GasWanted uint64          `json:"gas_wanted"`
}

// Event represents a blockchain event
type Event struct {
	Type       string           `json:"type"`
	Attributes []EventAttribute `json:"attributes"`
}

type EventAttribute struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// NewWasmClient creates a new WasmClient
func NewWasmClient(rpcUrl string, signer Signer) *WasmClient {
	return &WasmClient{
		RpcUrl: rpcUrl,
		Signer: signer,
	}
}

// StoreCode stores WASM bytecode and returns code ID
func (c *WasmClient) StoreCode(ctx context.Context, wasmCode []byte, sender string) (uint64, error) {
	msg := &MsgStoreCode{
		WasmCode: wasmCode,
		Sender:   sender,
	}

	resp, err := c.Signer.SignAndBroadcast(ctx, []MsgWasm{msg}, Fee{Gas: 100000})
	if err != nil {
		return 0, err
	}

	// Parse response for code_id
	var result struct {
		CodeID uint64 `json:"code_id"`
	}
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return 0, err
	}
	return result.CodeID, nil
}

// Instantiate instantiates a WASM contract and returns contract address
func (c *WasmClient) Instantiate(ctx context.Context, codeID uint64, initMsg json.RawMessage, sender, label string) (string, error) {
	msg := &MsgInstantiateContract{
		Sender:   sender,
		CodeID:   codeID,
		Label:    label,
		InitMsg:  initMsg,
		GasLimit: 200000,
	}

	resp, err := c.Signer.SignAndBroadcast(ctx, []MsgWasm{msg}, Fee{Gas: 200000})
	if err != nil {
		return "", err
	}

	var result struct {
		ContractAddress string `json:"contract_address"`
	}
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return "", err
	}
	return result.ContractAddress, nil
}

// Execute executes a WASM contract
func (c *WasmClient) Execute(ctx context.Context, contractAddr string, msg json.RawMessage, sender string, gasLimit uint64) (*TxResponse, error) {
	m := &MsgExecuteContract{
		Sender:          sender,
		ContractAddress: contractAddr,
		Msg:             msg,
		GasLimit:        gasLimit,
	}

	resp, err := c.Signer.SignAndBroadcast(ctx, []MsgWasm{m}, Fee{Gas: gasLimit})
	return resp, err
}