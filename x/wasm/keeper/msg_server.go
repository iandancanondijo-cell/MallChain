package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"marketplace/x/wasm/types"
)

type MsgServer struct {
	Keeper
}

type QueryServer struct {
	Keeper
}

func NewMsgServerImpl(k Keeper) MsgServer {
	return MsgServer{Keeper: k}
}

func NewQueryServerImpl(k Keeper) QueryServer {
	return QueryServer{Keeper: k}
}

// moduleDisabledErr rejects the state-mutating x/wasm messages until the VM
// integration described in wasm_vm.go's WasmVM doc comment is finished:
// contract input/output is never actually wired to the sandboxed wazero
// instance, no host functions are registered (no way to read/write state or
// move tokens from inside a contract), and gas is a flat fee rather than
// metered per instruction. Shipping StoreCode/Instantiate/Execute as-is
// would let anyone deploy "contracts" that always report hardcoded success
// regardless of what they actually do — unacceptable for a surface that can
// hold or move funds. Queries stay open since they're read-only against
// pre-existing (pre-this-change) state and can't move funds. Remove this
// gate once that VM work lands.
func moduleDisabledErr(msgName string) error {
	return types.ErrModuleDisabled.Wrapf("%s is disabled: x/wasm's contract execution is not production-ready (see WasmVM doc comment in keeper/wasm_vm.go)", msgName)
}

func (m MsgServer) StoreCode(ctx context.Context, msg *types.MsgStoreCode) (*types.MsgStoreCodeResponse, error) {
	return nil, moduleDisabledErr("MsgStoreCode")
}

func (m MsgServer) InstantiateContract(ctx context.Context, msg *types.MsgInstantiateContract) (*types.MsgInstantiateContractResponse, error) {
	return nil, moduleDisabledErr("MsgInstantiateContract")
}

func (m MsgServer) ExecuteContract(ctx context.Context, msg *types.MsgExecuteContract) (*types.MsgExecuteContractResponse, error) {
	return nil, moduleDisabledErr("MsgExecuteContract")
}

func (q QueryServer) Contract(ctx context.Context, req *types.QueryContractRequest) (*types.QueryContractResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	_ = sdkCtx

	response, err := q.Keeper.QueryContract(ctx, req.ContractAddress, req.Query)
	if err != nil {
		return nil, err
	}
	return &types.QueryContractResponse{Response: response}, nil
}

func (q QueryServer) AllContracts(ctx context.Context, req *types.QueryAllContractsRequest) (*types.QueryAllContractsResponse, error) {
	contracts, err := q.Keeper.GetAllContracts(ctx)
	if err != nil {
		return nil, err
	}
	return &types.QueryAllContractsResponse{Contracts: contracts}, nil
}