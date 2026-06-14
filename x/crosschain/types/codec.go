package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the necessary x/crosschain interfaces and concrete types
// on the provided LegacyAmino codec. These types are used for Amino JSON serialization.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgInitiateBridgeTransfer{}, "crosschain/InitiateBridgeTransfer", nil)
	cdc.RegisterConcrete(&MsgCompleteBridgeTransfer{}, "crosschain/CompleteBridgeTransfer", nil)
	cdc.RegisterConcrete(&MsgUpdateParams{}, "crosschain/UpdateParams", nil)
}

// RegisterInterfaces registers interfaces and implementations of the crosschain module.
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgInitiateBridgeTransfer{},
		&MsgCompleteBridgeTransfer{},
		&MsgUpdateParams{},
	)
}

var (
	Amino     = codec.NewLegacyAmino()
	ModuleCdc = codec.NewProtoCodec(codectypes.NewInterfaceRegistry())
)
