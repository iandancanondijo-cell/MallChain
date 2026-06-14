package types

import (
	"context"

	"github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	Route = ModuleName
)

type MsgStoreCode struct {
	WasmCode []byte `json:"wasm_code"`
	Sender   string `json:"sender"`
}

func (m *MsgStoreCode) Reset()         { *m = MsgStoreCode{} }
func (m *MsgStoreCode) String() string { return string(m.WasmCode) }
func (*MsgStoreCode) ProtoMessage()    {}

func (m *MsgStoreCode) ValidateBasic() error {
	if len(m.WasmCode) == 0 {
		return ErrInvalidRequest
	}
	if m.Sender == "" {
		return ErrInvalidRequest
	}
	return nil
}

func (m *MsgStoreCode) GetSigners() []sdk.AccAddress {
	sender, err := sdk.AccAddressFromBech32(m.Sender)
	if err != nil {
		return nil
	}
	return []sdk.AccAddress{sender}
}

type MsgStoreCodeResponse struct {
	CodeID uint64 `json:"code_id"`
}

type MsgInstantiateContract struct {
	Sender   string `json:"sender"`
	CodeID   uint64 `json:"code_id"`
	Label    string `json:"label"`
	InitMsg  []byte `json:"init_msg"`
}

func (m *MsgInstantiateContract) Reset()         { *m = MsgInstantiateContract{} }
func (m *MsgInstantiateContract) String() string { return m.Label }
func (*MsgInstantiateContract) ProtoMessage()    {}

func (m *MsgInstantiateContract) ValidateBasic() error {
	if m.CodeID == 0 {
		return ErrInvalidRequest
	}
	if m.Sender == "" {
		return ErrInvalidRequest
	}
	return nil
}

func (m *MsgInstantiateContract) GetSigners() []sdk.AccAddress {
	sender, err := sdk.AccAddressFromBech32(m.Sender)
	if err != nil {
		return nil
	}
	return []sdk.AccAddress{sender}
}

type MsgInstantiateContractResponse struct {
	ContractAddress string `json:"contract_address"`
}

type MsgExecuteContract struct {
	Sender          string `json:"sender"`
	ContractAddress string `json:"contract_address"`
	Msg             []byte `json:"msg"`
	GasLimit        uint64 `json:"gas_limit,omitempty"`
}

func (m *MsgExecuteContract) Reset()         { *m = MsgExecuteContract{} }
func (m *MsgExecuteContract) String() string { return m.ContractAddress }
func (*MsgExecuteContract) ProtoMessage()    {}

func (m *MsgExecuteContract) ValidateBasic() error {
	if m.ContractAddress == "" {
		return ErrInvalidRequest
	}
	if m.Sender == "" {
		return ErrInvalidRequest
	}
	return nil
}

func (m *MsgExecuteContract) GetSigners() []sdk.AccAddress {
	sender, err := sdk.AccAddressFromBech32(m.Sender)
	if err != nil {
		return nil
	}
	return []sdk.AccAddress{sender}
}

type MsgExecuteContractResponse struct {
	Data string `json:"data"`
}

type QueryContractRequest struct {
	ContractAddress string `json:"contract_address"`
	Query           []byte `json:"query"`
}

type QueryContractResponse struct {
	Response []byte `json:"response"`
}

type QueryAllContractsRequest struct {
	PaginationKey []byte `json:"pagination_key,omitempty"`
}

type QueryAllContractsResponse struct {
	Contracts     []string `json:"contracts"`
	PaginationKey []byte   `json:"pagination_key,omitempty"`
}

type QueryServer interface {
	Contract(context.Context, *QueryContractRequest) (*QueryContractResponse, error)
	AllContracts(context.Context, *QueryAllContractsRequest) (*QueryAllContractsResponse, error)
}

type MsgServer interface {
	StoreCode(context.Context, *MsgStoreCode) (*MsgStoreCodeResponse, error)
	InstantiateContract(context.Context, *MsgInstantiateContract) (*MsgInstantiateContractResponse, error)
	ExecuteContract(context.Context, *MsgExecuteContract) (*MsgExecuteContractResponse, error)
}

func RegisterMsgServer(_ interface{}, _ MsgServer)   {}
func RegisterQueryServer(_ interface{}, _ QueryServer) {}

func RegisterInterfaces(registry types.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgStoreCode{},
		&MsgInstantiateContract{},
		&MsgExecuteContract{},
	)
}