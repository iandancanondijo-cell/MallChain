package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the necessary x/dex interfaces and concrete types on the provided LegacyAmino codec.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgCreatePool{}, "dex/CreatePool", nil)
	cdc.RegisterConcrete(&MsgAddLiquidity{}, "dex/AddLiquidity", nil)
	cdc.RegisterConcrete(&MsgRemoveLiquidity{}, "dex/RemoveLiquidity", nil)
	cdc.RegisterConcrete(&MsgSwap{}, "dex/Swap", nil)
	cdc.RegisterConcrete(&MsgUpdateParams{}, "dex/UpdateParams", nil)
}

// RegisterInterfaces registers interfaces and implementations of the dex module.
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgCreatePool{},
		&MsgAddLiquidity{},
		&MsgRemoveLiquidity{},
		&MsgSwap{},
		&MsgUpdateParams{},
	)
}
