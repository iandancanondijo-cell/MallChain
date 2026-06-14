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

func (m MsgServer) StoreCode(ctx context.Context, msg *types.MsgStoreCode) (*types.MsgStoreCodeResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	_ = sdkCtx

	codeID, err := m.Keeper.StoreCode(ctx, msg.WasmCode)
	if err != nil {
		return nil, err
	}
	return &types.MsgStoreCodeResponse{CodeID: codeID}, nil
}

func (m MsgServer) InstantiateContract(ctx context.Context, msg *types.MsgInstantiateContract) (*types.MsgInstantiateContractResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	_ = sdkCtx

	contractAddr, err := m.Keeper.InstantiateContract(ctx, msg.Sender, msg.CodeID, msg.Label, msg.InitMsg)
	if err != nil {
		return nil, err
	}
	return &types.MsgInstantiateContractResponse{ContractAddress: contractAddr}, nil
}

func (m MsgServer) ExecuteContract(ctx context.Context, msg *types.MsgExecuteContract) (*types.MsgExecuteContractResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	_ = sdkCtx

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