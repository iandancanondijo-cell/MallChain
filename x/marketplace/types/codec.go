package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the necessary x/marketplace interfaces and concrete types on the provided LegacyAmino codec.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgCreateEscrow{}, "marketplace/CreateEscrow", nil)
	cdc.RegisterConcrete(&MsgReleaseFunds{}, "marketplace/ReleaseFunds", nil)
	cdc.RegisterConcrete(&MsgRefundBuyer{}, "marketplace/RefundBuyer", nil)
	cdc.RegisterConcrete(&MsgOpenDispute{}, "marketplace/OpenDispute", nil)
}

// RegisterInterfaces registers interfaces and implementations of the marketplace module.
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgCreateEscrow{},
		&MsgReleaseFunds{},
		&MsgRefundBuyer{},
		&MsgOpenDispute{},
	)
}
