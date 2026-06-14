package module

import (
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/log"
	"github.com/cosmos/cosmos-sdk/codec"

	"marketplace/x/crosschain/keeper"
	"marketplace/x/crosschain/types"
)

var _ depinject.OnePerModuleType = AppModule{}

func init() {
	appmodule.Register(
		&types.Module{},
		appmodule.Provide(
			ProvideModule,
		),
	)
}

type ModuleInputs struct {
	depinject.In

	StoreService store.KVStoreService
	Cdc          codec.Codec
	Logger       log.Logger

	AccountKeeper types.AccountKeeper
	BankKeeper    types.BankKeeper
	IBCKeeper     types.IBCTransferKeeper
}

type ModuleOutputs struct {
	depinject.Out

	CrosschainKeeper keeper.Keeper
	Module           appmodule.AppModule
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
	k := keeper.NewKeeper(
		in.Cdc,
		in.StoreService,
		in.Logger,
		in.AccountKeeper,
		in.BankKeeper,
		in.IBCKeeper,
	)
	m := NewAppModule(in.Cdc, k)

	return ModuleOutputs{
		CrosschainKeeper: k,
		Module:           m,
	}
}
