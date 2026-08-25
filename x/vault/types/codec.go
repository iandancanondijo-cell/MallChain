package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterCodec registers the necessary x/vault interfaces and concrete types on the provided LegacyAmino codec.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgSetupVault{}, "vault/SetupVault", nil)
	cdc.RegisterConcrete(&MsgConfirmVault{}, "vault/ConfirmVault", nil)
	cdc.RegisterConcrete(&MsgDisableVault{}, "vault/DisableVault", nil)
}

// RegisterInterfaces registers interfaces and implementations of the vault module.
// This is what the SDK's MsgServiceRouter actually needs to resolve a
// MsgSetupVault etc. type_url at RegisterService time — without it,
// RegisterModules panics with "type_url ... has not been registered yet"
// the moment it tries to wire vault's Msg service into the router.
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgSetupVault{},
		&MsgConfirmVault{},
		&MsgDisableVault{},
	)
}
