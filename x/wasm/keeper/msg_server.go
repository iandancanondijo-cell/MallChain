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

// x/wasm was previously hard-disabled at this layer (moduleDisabledErr)
// because contract input/output was never wired to the sandboxed wazero
// instance, no host functions were registered, and gas was a flat fee
// rather than metered per call. wasm_vm.go and host.go now implement all
// three (see WasmVM's doc comment for the exact calling convention), so
// these are wired to the real keeper methods.

func (m MsgServer) StoreCode(ctx context.Context, msg *types.MsgStoreCode) (*types.MsgStoreCodeResponse, error) {
	codeID, err := m.Keeper.StoreCode(ctx, msg.WasmCode)
	if err != nil {
		return nil, err
	}
	return &types.MsgStoreCodeResponse{CodeId: codeID}, nil
}

func (m MsgServer) InstantiateContract(ctx context.Context, msg *types.MsgInstantiateContract) (*types.MsgInstantiateContractResponse, error) {
	contractAddr, err := m.Keeper.InstantiateContract(ctx, msg.Sender, msg.CodeId, msg.Label, msg.InitMsg)
	if err != nil {
		return nil, err
	}
	return &types.MsgInstantiateContractResponse{ContractAddress: contractAddr}, nil
}

func (m MsgServer) ExecuteContract(ctx context.Context, msg *types.MsgExecuteContract) (*types.MsgExecuteContractResponse, error) {
	result, err := m.Keeper.ExecuteContract(ctx, msg.Sender, msg.ContractAddress, msg.Msg)
	if err != nil {
		return nil, err
	}
	return &types.MsgExecuteContractResponse{Data: result}, nil
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