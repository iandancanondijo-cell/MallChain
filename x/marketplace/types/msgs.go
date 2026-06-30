package types

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

func RegisterMsgServer(registrar interface{ RegisterService(*ServiceDesc, interface{}) }, srv MsgServer) {
	registrar.RegisterService(&_Msg_service_desc, srv)
}

func RegisterQueryServer(registrar interface{ RegisterService(*ServiceDesc, interface{}) }, srv QueryServer) {
	registrar.RegisterService(&_Query_service_desc, srv)
}

type ServiceDesc struct {
	ServiceName string
	HandlerType interface{}
	Methods     []MethodDesc
}

type MethodDesc struct {
	MethodName string
	Handler    Handler
}

type Handler func(ctx context.Context, req interface{}, srv interface{}) (interface{}, error)

var _Msg_service_desc = ServiceDesc{
	ServiceName: "marketplace.Msg",
}

var _Query_service_desc = ServiceDesc{
	ServiceName: "marketplace.Query",
}

type MsgServer interface {
	CreateEscrow(sdkCtx interface{}, msg *MsgCreateEscrow) (*MsgCreateEscrowResponse, error)
	ReleaseFunds(sdkCtx interface{}, msg *MsgReleaseFunds) (*MsgReleaseFundsResponse, error)
	RefundBuyer(sdkCtx interface{}, msg *MsgRefundBuyer) (*MsgRefundBuyerResponse, error)
	OpenDispute(sdkCtx interface{}, msg *MsgOpenDispute) (*MsgOpenDisputeResponse, error)
}

type UnimplementedMsgServer struct{}

func (UnimplementedMsgServer) CreateEscrow(interface{}, *MsgCreateEscrow) (*MsgCreateEscrowResponse, error) {
	return nil, nil
}

func (UnimplementedMsgServer) ReleaseFunds(interface{}, *MsgReleaseFunds) (*MsgReleaseFundsResponse, error) {
	return nil, nil
}

func (UnimplementedMsgServer) RefundBuyer(interface{}, *MsgRefundBuyer) (*MsgRefundBuyerResponse, error) {
	return nil, nil
}

func (UnimplementedMsgServer) OpenDispute(interface{}, *MsgOpenDispute) (*MsgOpenDisputeResponse, error) {
	return nil, nil
}

type MsgCreateEscrow struct {
	Buyer              string `json:"buyer"`
	Seller             string `json:"seller"`
	Amount             string `json:"amount"`
	Denom              string `json:"denom"`
	Description        string `json:"description"`
	DisputeWindowSeconds uint64 `json:"dispute_window_seconds"`
}

func (msg *MsgCreateEscrow) GetSigners() []sdk.AccAddress {
	buyer, err := sdk.AccAddressFromBech32(msg.Buyer)
	if err != nil {
		panic(err)
	}
	return []sdk.AccAddress{buyer}
}

type MsgCreateEscrowResponse struct {
	EscrowId string `json:"escrow_id"`
}

type MsgReleaseFunds struct {
	EscrowId string `json:"escrow_id"`
	ReleaseBy string `json:"release_by"`
}

func (msg *MsgReleaseFunds) GetSigners() []sdk.AccAddress {
	releaseBy, err := sdk.AccAddressFromBech32(msg.ReleaseBy)
	if err != nil {
		panic(err)
	}
	return []sdk.AccAddress{releaseBy}
}

type MsgReleaseFundsResponse struct{}

type MsgRefundBuyer struct {
	EscrowId string `json:"escrow_id"`
}

func (msg *MsgRefundBuyer) GetSigners() []sdk.AccAddress {
	return []sdk.AccAddress{}
}

type MsgRefundBuyerResponse struct{}

type MsgOpenDispute struct {
	EscrowId string `json:"escrow_id"`
	Opener   string `json:"opener"`
}

func (msg *MsgOpenDispute) GetSigners() []sdk.AccAddress {
	opener, err := sdk.AccAddressFromBech32(msg.Opener)
	if err != nil {
		panic(err)
	}
	return []sdk.AccAddress{opener}
}

type MsgOpenDisputeResponse struct{}

type QueryServer interface {
	GetEscrow(context.Context, *QueryGetEscrowRequest) (*QueryGetEscrowResponse, error)
	ListEscrows(context.Context, *QueryListEscrowsRequest) (*QueryListEscrowsResponse, error)
}

type UnimplementedQueryServer struct{}

func (UnimplementedQueryServer) GetEscrow(context.Context, *QueryGetEscrowRequest) (*QueryGetEscrowResponse, error) {
	return nil, nil
}

func (UnimplementedQueryServer) ListEscrows(context.Context, *QueryListEscrowsRequest) (*QueryListEscrowsResponse, error) {
	return nil, nil
}

type QueryGetEscrowRequest struct {
	EscrowId string `json:"escrow_id"`
}

type QueryGetEscrowResponse struct {
	Escrow *Escrow `json:"escrow,omitempty"`
}

type QueryListEscrowsRequest struct {
	Pagination *PageRequest `json:"pagination,omitempty"`
}

type QueryListEscrowsResponse struct {
	Escrows    []Escrow      `json:"escrows"`
	Pagination *PageResponse `json:"pagination,omitempty"`
}

type PageRequest struct {
	Key        string `json:"key,omitempty"`
	Offset     uint64 `json:"offset,omitempty"`
	Limit      uint64 `json:"limit,omitempty"`
	CountTotal bool   `json:"count_total,omitempty"`
}

type PageResponse struct {
	NextKey string `json:"next_key,omitempty"`
	Total   uint64 `json:"total,omitempty"`
}

type GenesisState struct {
	Escrows []Escrow `json:"escrows,omitempty"`
}

func DefaultGenesis() GenesisState {
	return GenesisState{}
}

func (gs GenesisState) Validate() error {
	return nil
}