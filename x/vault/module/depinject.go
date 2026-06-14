package vault

import (
	"fmt"
	"reflect"

	"cosmossdk.io/core/address"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	"cosmossdk.io/x/tx/signing"

	"github.com/cosmos/cosmos-sdk/codec"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"marketplace/x/vault/keeper"
	"marketplace/x/vault/types"
)

var _ depinject.OnePerModuleType = AppModule{}

func (AppModule) IsOnePerModuleType() {}

func init() {
	appconfig.Register(
		&types.Module{},
		appconfig.Provide(
			ProvideModule,
			ProvideMsgSetupVaultSigner,
			ProvideMsgConfirmVaultSigner,
			ProvideMsgUnlockAndSignSigner,
			ProvideMsgDisableVaultSigner,
		),
	)
}

type ModuleInputs struct {
	depinject.In

	Config       *types.Module
	StoreService store.KVStoreService
	Cdc          codec.Codec
	AddressCodec address.Codec
}

type ModuleOutputs struct {
	depinject.Out

	VaultKeeper *keeper.Keeper
	Module      appmodule.AppModule
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
	k := keeper.NewKeeper(in.StoreService, in.Cdc)
	m := NewAppModule(in.Cdc, k)
	return ModuleOutputs{VaultKeeper: k, Module: m}
}

// Provide custom signer getters for vault messages so startup validation
// does not strictly require the cosmos.msg.v1.signer proto option to be present.
// These are ManyPerContainer providers (signing.CustomGetSigner implements
// IsManyPerContainerType) and will be aggregated into the []signing.CustomGetSigner
// slice consumed by the runtime.
func ProvideMsgSetupVaultSigner(addressCodec address.Codec) signing.CustomGetSigner {
	return signing.CustomGetSigner{
		MsgType: protoreflect.FullName("marketplace.vault.v1.MsgSetupVault"),
		Fn: func(m proto.Message) ([][]byte, error) {
			// Extract the Authority field reflectively to avoid concrete proto type
			// assertions (gogo vs google protos differ). We expect a string field
			// named "Authority" on the message.
			v := reflect.ValueOf(m)
			if v.Kind() == reflect.Ptr {
				v = v.Elem()
			}
			if !v.IsValid() {
				return nil, fmt.Errorf("invalid message")
			}
			f := v.FieldByName("Authority")
			if !f.IsValid() || f.Kind() != reflect.String {
				return nil, fmt.Errorf("authority field not found or not a string on %T", m)
			}
			bz, err := addressCodec.StringToBytes(f.String())
			if err != nil {
				return nil, err
			}
			return [][]byte{bz}, nil
		},
	}
}

func ProvideMsgConfirmVaultSigner(addressCodec address.Codec) signing.CustomGetSigner {
	return signing.CustomGetSigner{
		MsgType: protoreflect.FullName("marketplace.vault.v1.MsgConfirmVault"),
		Fn: func(m proto.Message) ([][]byte, error) {
			v := reflect.ValueOf(m)
			if v.Kind() == reflect.Ptr {
				v = v.Elem()
			}
			if !v.IsValid() {
				return nil, fmt.Errorf("invalid message")
			}
			f := v.FieldByName("Authority")
			if !f.IsValid() || f.Kind() != reflect.String {
				return nil, fmt.Errorf("authority field not found or not a string on %T", m)
			}
			bz, err := addressCodec.StringToBytes(f.String())
			if err != nil {
				return nil, err
			}
			return [][]byte{bz}, nil
		},
	}
}

func ProvideMsgUnlockAndSignSigner(addressCodec address.Codec) signing.CustomGetSigner {
	return signing.CustomGetSigner{
		MsgType: protoreflect.FullName("marketplace.vault.v1.MsgUnlockAndSign"),
		Fn: func(m proto.Message) ([][]byte, error) {
			v := reflect.ValueOf(m)
			if v.Kind() == reflect.Ptr {
				v = v.Elem()
			}
			if !v.IsValid() {
				return nil, fmt.Errorf("invalid message")
			}
			f := v.FieldByName("Authority")
			if !f.IsValid() || f.Kind() != reflect.String {
				return nil, fmt.Errorf("authority field not found or not a string on %T", m)
			}
			bz, err := addressCodec.StringToBytes(f.String())
			if err != nil {
				return nil, err
			}
			return [][]byte{bz}, nil
		},
	}
}

func ProvideMsgDisableVaultSigner(addressCodec address.Codec) signing.CustomGetSigner {
	return signing.CustomGetSigner{
		MsgType: protoreflect.FullName("marketplace.vault.v1.MsgDisableVault"),
		Fn: func(m proto.Message) ([][]byte, error) {
			v := reflect.ValueOf(m)
			if v.Kind() == reflect.Ptr {
				v = v.Elem()
			}
			if !v.IsValid() {
				return nil, fmt.Errorf("invalid message")
			}
			f := v.FieldByName("Authority")
			if !f.IsValid() || f.Kind() != reflect.String {
				return nil, fmt.Errorf("authority field not found or not a string on %T", m)
			}
			bz, err := addressCodec.StringToBytes(f.String())
			if err != nil {
				return nil, err
			}
			return [][]byte{bz}, nil
		},
	}
}
