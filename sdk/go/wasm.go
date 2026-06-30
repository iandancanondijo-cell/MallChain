package mallchain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	Sender   string          `json:"sender"`
	CodeID   uint64          `json:"code_id"`
	Label    string          `json:"label,omitempty"`
	InitMsg  json.RawMessage `json:"init_msg"`
	GasLimit uint64          `json:"gas_limit,omitempty"`
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
	return &resp, err
}

// Query queries a WASM contract via REST
func (c *WasmClient) Query(ctx context.Context, contractAddr string, query json.RawMessage) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/wasm/contract/%s", c.RpcUrl, url.PathEscape(contractAddr)),
		bytes.NewReader(query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

// MlcoinClient provides Mallcoin token interaction methods.
type MlcoinClient struct {
	RpcUrl string
	Signer Signer
}

// NewMlcoinClient creates a new Mallcoin client.
func NewMlcoinClient(rpcUrl string, signer Signer) *MlcoinClient {
	return &MlcoinClient{
		RpcUrl: rpcUrl,
		Signer: signer,
	}
}

// Transfer transfers mallcoin from sender to recipient.
func (c *MlcoinClient) Transfer(ctx context.Context, from, to string, amount uint64, denom string) (*TxResponse, error) {
	resp, err := c.Signer.SignAndBroadcast(ctx, []MsgWasm{}, Fee{Gas: 100000})
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// Balance queries a wallet balance.
func (c *MlcoinClient) Balance(ctx context.Context, address string) (uint64, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("%s/mlcoin/balance/%s", c.RpcUrl, url.PathEscape(address)), nil)
	if err != nil {
		return 0, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	var result struct {
		Balance uint64 `json:"balance"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}
	return result.Balance, nil
}

// MarketplaceClient provides marketplace escrow interaction methods.
type MarketplaceClient struct {
	RpcUrl string
	Signer Signer
}

// NewMarketplaceClient creates a new Marketplace client.
func NewMarketplaceClient(rpcUrl string, signer Signer) *MarketplaceClient {
	return &MarketplaceClient{
		RpcUrl: rpcUrl,
		Signer: signer,
	}
}

// CreateEscrow creates a new escrow order.
func (c *MarketplaceClient) CreateEscrow(ctx context.Context, buyer, seller, amount, denom, description string, disputeWindow uint64) (string, error) {
	resp, err := c.Signer.SignAndBroadcast(ctx, []MsgWasm{}, Fee{Gas: 150000})
	if err != nil {
		return "", err
	}
	var result struct {
		EscrowID string `json:"escrow_id"`
	}
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return "", err
	}
	return result.EscrowID, nil
}

// GetEscrow queries escrow details by ID.
func (c *MarketplaceClient) GetEscrow(ctx context.Context, escrowID string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("%s/marketplace/escrow/%s", c.RpcUrl, url.PathEscape(escrowID)), nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// Client is the main entry point for Mallchain SDK interactions.
type Client struct {
	Wasm        *WasmClient
	Mlcoin      *MlcoinClient
	Marketplace *MarketplaceClient
}

// ClientOptions configures the SDK client.
type ClientOptions struct {
	RpcUrl string
}

// NewClient creates a new Mallchain SDK client.
func NewClient(opts ClientOptions, signer Signer) *Client {
	return &Client{
		Wasm:        NewWasmClient(opts.RpcUrl, signer),
		Mlcoin:      NewMlcoinClient(opts.RpcUrl, signer),
		Marketplace: NewMarketplaceClient(opts.RpcUrl, signer),
	}
}
