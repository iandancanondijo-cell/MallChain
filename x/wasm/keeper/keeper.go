package keeper

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"strconv"

	"cosmossdk.io/collections"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/wasm/types"
	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec

	Schema         collections.Schema
	ContractCode   collections.Map[uint64, []byte]
	ContractCodeID collections.Sequence
	Contracts      collections.Map[string, []byte]
	ContractSeq    collections.Sequence
	ContractState  collections.Map[collections.Pair[string, string], []byte]

	wasmbridgeKeeper types.WasmBridgeKeeper
	wasmVM           *WasmVM
}

type ContractMetadata struct {
	CodeID     uint64 `json:"code_id"`
	Creator    string `json:"creator"`
	Label      string `json:"label"`
	InitMsg    []byte `json:"init_msg"`
	Admin      string `json:"admin,omitempty"`
	Version    string `json:"version,omitempty"`
}

const (
	DefaultGasLimit = uint64(100000)
)

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	wasmbridgeKeeper types.WasmBridgeKeeper,
) (Keeper, error) {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		ContractCode: collections.NewMap(sb, []byte("code/"), "contractCode", collections.Uint64Key, collections.BytesValue),
		ContractCodeID: collections.NewSequence(sb, []byte("codeSeq/"), "contractCodeID"),
		Contracts: collections.NewMap(sb, []byte("contract/"), "contracts", collections.StringKey, collections.BytesValue),
		ContractSeq: collections.NewSequence(sb, []byte("contractSeq/"), "contractSeq"),
		ContractState: collections.NewMap(sb, []byte("contractState/"), "contractState", collections.PairKeyCodec(collections.StringKey, collections.StringKey), collections.BytesValue),
		wasmbridgeKeeper: wasmbridgeKeeper,
	}

	schema, err := sb.Build()
	if err != nil {
		return Keeper{}, err
	}
	k.Schema = schema

	return k, nil
}

// getWasmVM lazily initializes the WASM VM on first use
func (k *Keeper) getWasmVM(ctx context.Context) *WasmVM {
	if k.wasmVM == nil {
		k.wasmVM = NewWasmVM(ctx)
		k.wasmVM.keeper = k
	}
	return k.wasmVM
}

func (k Keeper) StoreCode(ctx context.Context, wasmCode []byte) (uint64, error) {
	codeID, err := k.ContractCodeID.Next(ctx)
	if err != nil {
		return 0, err
	}

	if codeID == 0 {
		codeID = 1
		if err := k.ContractCodeID.Set(ctx, 2); err != nil {
			return 0, err
		}
	}

	if len(wasmCode) == 0 {
		return 0, types.ErrInvalidRequest.Wrap("contract code is empty")
	}

	if err := k.ContractCode.Set(ctx, codeID, wasmCode); err != nil {
		return 0, err
	}
	return codeID, nil
}

func (k Keeper) GetCode(ctx context.Context, codeID uint64) ([]byte, error) {
	code, err := k.ContractCode.Get(ctx, codeID)
	if err != nil {
		return nil, types.ErrCodeNotFound.Wrap(err.Error())
	}
	return code, nil
}

func (k Keeper) InstantiateContract(ctx context.Context, sender string, codeID uint64, label string, initMsg []byte) (string, error) {
	wasmCode, err := k.GetCode(ctx, codeID)
	if err != nil {
		return "", types.ErrCodeNotFound.Wrap("code not found")
	}

	contractAddr, err := k.GenerateContractAddress(ctx, sender)
	if err != nil {
		return "", err
	}

	contract := ContractMetadata{
		CodeID:  codeID,
		Creator: sender,
		Label:   label,
		InitMsg: initMsg,
		Admin:   sender,
		Version: "1.0.0",
	}
	recordBz, err := json.Marshal(contract)
	if err != nil {
		return "", err
	}

	if err := k.Contracts.Set(ctx, contractAddr, recordBz); err != nil {
		return "", err
	}

	// Set contract admin in state for permission checks
	k.SetContractState(ctx, contractAddr, "admin", []byte(sender))

	// Initialize WASM contract
	vm := k.getWasmVM(ctx)
	gasCfg, _ := k.GetGasConfig(ctx)
	_, _ = vm.InitializeWASM(ctx, wasmCode, initMsg, contractAddr, gasCfg.DefaultGasLimit, gasCfg.InstantiateCost)

	// Emit instantiation event
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeInstantiate,
			sdk.NewAttribute("contract_address", contractAddr),
			sdk.NewAttribute("code_id", strconv.FormatUint(codeID, 10)),
			sdk.NewAttribute("label", label),
		),
	)

	return contractAddr, nil
}

func (k Keeper) GenerateContractAddress(ctx context.Context, sender string) (string, error) {
	seq, err := k.ContractSeq.Next(ctx)
	if err != nil {
		return "", err
	}

	senderAddr, err := sdk.AccAddressFromBech32(sender)
	if err != nil {
		return "", err
	}

	h := sha256.New()
	h.Write([]byte("mallchain/wasm"))
	h.Write(senderAddr)
	seqBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(seqBytes, seq)
	h.Write(seqBytes)

	hash := h.Sum(nil)
	return sdk.AccAddress(hash[:20]).String(), nil
}

func (k Keeper) GetContract(ctx context.Context, contractAddr string) (*ContractMetadata, error) {
	bz, err := k.Contracts.Get(ctx, contractAddr)
	if err != nil {
		return nil, types.ErrCodeNotFound.Wrap("contract not found")
	}

	var contract ContractMetadata
	if err := json.Unmarshal(bz, &contract); err != nil {
		return nil, err
	}
	return &contract, nil
}

func (k Keeper) SetContractState(ctx context.Context, contractAddr string, key string, value []byte) error {
	return k.ContractState.Set(ctx, collections.Join(contractAddr, key), value)
}

func (k Keeper) GetContractState(ctx context.Context, contractAddr string, key string) ([]byte, error) {
	bz, err := k.ContractState.Get(ctx, collections.Join(contractAddr, key))
	if err != nil {
		return nil, nil
	}
	return bz, nil
}

// isContractAdmin checks if sender is admin of the contract
func (k Keeper) isContractAdmin(ctx context.Context, contractAddr, sender string) bool {
	admin, err := k.GetContractState(ctx, contractAddr, "admin")
	if err != nil {
		return false
	}
	return string(admin) == sender
}

// AuthorizeAction checks if sender is authorized to execute action on contract
func (k Keeper) AuthorizeAction(ctx context.Context, contractAddr, sender string, action string) error {
	contract, err := k.GetContract(ctx, contractAddr)
	if err != nil {
		return err
	}

	// Admin can execute any action
	if k.isContractAdmin(ctx, contractAddr, sender) {
		return nil
	}

	// Creator can execute any action
	if contract.Creator == sender {
		return nil
	}

	// For mgp20 actions, sender only needs to be valid (token-level auth)
	if action == "transfer" || action == "approve" {
		return nil
	}

	return types.ErrUnauthorized.Wrap("sender not authorized for action")
}

func (k Keeper) ExecuteContract(ctx context.Context, sender string, contractAddr string, msg []byte) (string, error) {
	contract, err := k.GetContract(ctx, contractAddr)
	if err != nil {
		return "", types.ErrCodeNotFound.Wrap("contract not found")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	var actionMsg map[string]interface{}
	if err := json.Unmarshal(msg, &actionMsg); err != nil {
		return "", err
	}

	action, ok := actionMsg["action"].(string)
	if !ok {
		return "", types.ErrInvalidRequest.Wrap("missing action field")
	}

	// Authorization check
	if err := k.AuthorizeAction(ctx, contractAddr, sender, action); err != nil {
		return "", err
	}

	// Gas accounting
	gasCfg, _ := k.GetGasConfig(ctx)
	gasLimit := gasCfg.DefaultGasLimit
	if gl, ok := actionMsg["gas_limit"].(float64); ok {
		gasLimit = uint64(gl)
	}

	// Store execution in contract state
	k.setExecutionResult(ctx, contractAddr, "last_action", action)

	switch action {
	case "transfer":
		result, err := k.executeTransfer(ctx, sender, actionMsg)
		if err != nil {
			return "", err
		}
		k.emitContractEvent(sdkCtx, contractAddr, "transfer", actionMsg)
		return result, nil
	case "approve":
		result, err := k.executeApprove(ctx, sender, actionMsg)
		if err != nil {
			return "", err
		}
		k.emitContractEvent(sdkCtx, contractAddr, "approve", actionMsg)
		return result, nil
	case "wasm_execute":
		return k.executeWASMRaw(ctx, sdkCtx, contract, msg, gasLimit, gasCfg)
	default:
		return "", types.ErrContractFailed.Wrap("unknown action")
	}
}

func (k Keeper) setExecutionResult(ctx context.Context, contractAddr, key, value string) {
	resultBz := []byte(value)
	_ = k.SetContractState(ctx, contractAddr, key, resultBz)
}

func (k Keeper) emitContractEvent(sdkCtx sdk.Context, contractAddr, action string, msg map[string]interface{}) {
	attrs := []sdk.Attribute{sdk.NewAttribute("contract", contractAddr)}

	if to, ok := msg["to"].(string); ok {
		attrs = append(attrs, sdk.NewAttribute("to", to))
	}
	if spender, ok := msg["spender"].(string); ok {
		attrs = append(attrs, sdk.NewAttribute("spender", spender))
	}
	if amount, ok := msg["amount"].(float64); ok {
		attrs = append(attrs, sdk.NewAttribute("amount", strconv.FormatFloat(amount, 'f', 0, 64)))
	}

	ev := sdk.NewEvent("wasm_"+action, attrs...)
	sdkCtx.EventManager().EmitEvent(ev)
}

// executeWASMRaw executes raw WASM bytecode when VM is available
func (k Keeper) executeWASMRaw(ctx context.Context, sdkCtx sdk.Context, contract *ContractMetadata, msg []byte, gasLimit uint64, gasCfg types.GasConfig) (string, error) {
	wasmCode, err := k.GetCode(ctx, contract.CodeID)
	if err != nil {
		return "", err
	}

	senderAddr := contract.Creator
	vm := k.getWasmVM(ctx)
	result, err := vm.ExecuteWASM(ctx, wasmCode, msg, contract.Creator, senderAddr, gasLimit, gasCfg.ExecuteBaseCost, gasCfg.ExecuteExportCost)
	if err != nil {
		return "", err
	}

	if err := k.consumeSDKGas(sdkCtx, vm.GasUsed(), "wasm execute"); err != nil {
		return "", err
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			types.EventTypeExecute,
			sdk.NewAttribute("contract_code_id", strconv.FormatUint(contract.CodeID, 10)),
			sdk.NewAttribute("result", string(result)),
			sdk.NewAttribute("gas_used", strconv.FormatUint(vm.GasUsed(), 10)),
		),
	)

	return string(result), nil
}

func (k Keeper) executeTransfer(ctx context.Context, sender string, actionMsg map[string]interface{}) (string, error) {
	to, _ := actionMsg["to"].(string)
	amountFloat, _ := actionMsg["amount"].(float64)
	amount := uint64(amountFloat)

	transferMsg := wasmbridgetypes.MGP20TransferMsg{
		From:   sender,
		To:     to,
		Amount: amount,
	}

	if err := k.wasmbridgeKeeper.HandleTransfer(ctx, transferMsg); err != nil {
		return "", err
	}
	return "transfer_executed", nil
}

func (k Keeper) executeApprove(ctx context.Context, sender string, actionMsg map[string]interface{}) (string, error) {
	spender, _ := actionMsg["spender"].(string)
	amountFloat, _ := actionMsg["amount"].(float64)
	amount := uint64(amountFloat)

	approveMsg := wasmbridgetypes.MGP20ApproveMsg{
		Owner:   sender,
		Spender: spender,
		Amount:  amount,
	}

	if err := k.wasmbridgeKeeper.HandleApprove(ctx, approveMsg); err != nil {
		return "", err
	}
	return "approve_executed", nil
}

func (k Keeper) QueryContract(ctx context.Context, contractAddr string, query []byte) ([]byte, error) {
	_, err := k.GetContract(ctx, contractAddr)
	if err != nil {
		return nil, types.ErrCodeNotFound.Wrap("contract not found")
	}

	var queryMsg map[string]interface{}
	if err := json.Unmarshal(query, &queryMsg); err != nil {
		return nil, err
	}

	switch queryMsg["query"] {
	case "balance":
		return k.queryBalance(ctx, queryMsg)
	case "owner":
		return k.queryOwner(ctx, contractAddr)
	case "wasm_query":
		return k.queryWASMRaw(ctx, contractAddr, queryMsg)
	default:
		return nil, types.ErrContractFailed.Wrap("unknown query")
	}
}

// queryWASMRaw queries raw WASM contract state when VM is available
func (k Keeper) queryWASMRaw(ctx context.Context, contractAddr string, queryMsg map[string]interface{}) ([]byte, error) {
	contract, err := k.GetContract(ctx, contractAddr)
	if err != nil {
		return nil, err
	}

	wasmCode, err := k.GetCode(ctx, contract.CodeID)
	if err != nil {
		return nil, err
	}

	queryBytes, _ := json.Marshal(queryMsg)
	gasCfg, _ := k.GetGasConfig(ctx)
	vm := k.getWasmVM(ctx)
	result, err := vm.QueryWASM(ctx, wasmCode, queryBytes, contractAddr, gasCfg.DefaultGasLimit, gasCfg.QueryCost)
	if err != nil {
		return nil, err
	}

	return result, nil
}

func (k Keeper) queryBalance(ctx context.Context, queryMsg map[string]interface{}) ([]byte, error) {
	address, _ := queryMsg["address"].(string)

	balance, err := k.wasmbridgeKeeper.QueryBalance(ctx, address)
	if err != nil {
		return nil, err
	}

	return []byte(`{"balance": ` + strconv.FormatUint(balance, 10) + `}`), nil
}

func (k Keeper) queryOwner(ctx context.Context, contractAddr string) ([]byte, error) {
	contract, err := k.GetContract(ctx, contractAddr)
	if err != nil {
		return nil, err
	}
	return []byte(`{"owner": "` + contract.Creator + `"}`), nil
}

// GetAllContracts returns all contracts for explorer
func (k Keeper) GetAllContracts(ctx context.Context) ([]string, error) {
	var contracts []string
	iter, err := k.Contracts.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		addr, _ := iter.Key()
		contracts = append(contracts, addr)
	}
	return contracts, nil
}