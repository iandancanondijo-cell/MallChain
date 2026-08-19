package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the necessary x/wasm interfaces and concrete types on the provided LegacyAmino codec.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgStoreCode{}, "wasm/StoreCode", nil)
	cdc.RegisterConcrete(&MsgInstantiateContract{}, "wasm/InstantiateContract", nil)
	cdc.RegisterConcrete(&MsgExecuteContract{}, "wasm/ExecuteContract", nil)
}

// RegisterInterfaces registers interfaces and implementations of the wasm module.
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgStoreCode{},
		&MsgInstantiateContract{},
		&MsgExecuteContract{},
	)
}
