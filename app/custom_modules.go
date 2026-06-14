package app

import (
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"

	crosschainmodule "marketplace/x/crosschain/module"
	crosschaintypes "marketplace/x/crosschain/types"
	dexmod "marketplace/x/dex"
	dextypes "marketplace/x/dex/types"
	governancemod "marketplace/x/governance"
	governancetypes "marketplace/x/governance/types"
	wasmbridgemodule "marketplace/x/wasmbridge/module"
	wasmbridgetypes "marketplace/x/wasmbridge/types"
	wasmdirectmodule "marketplace/x/wasm/module"
	wasmtypes "marketplace/x/wasm/types"

	crosschainkeeper "marketplace/x/crosschain/keeper"
	dexkeeper "marketplace/x/dex/keeper"
	governancekeeper "marketplace/x/governance/keeper"
	wasmbridgekeeper "marketplace/x/wasmbridge/keeper"
	wasmkeeper "marketplace/x/wasm/keeper"
)

func (app *App) registerCustomModules() error {
	if err := app.RegisterStores(
		// RegisterStores includes wasm store key
	storetypes.NewKVStoreKey(crosschaintypes.StoreKey),
	storetypes.NewKVStoreKey(dextypes.StoreKey),
	storetypes.NewKVStoreKey(governancetypes.StoreKey),
	storetypes.NewKVStoreKey(wasmbridgetypes.StoreKey),
	storetypes.NewKVStoreKey(wasmtypes.StoreKey),
	); err != nil {
		return err
	}

	// Crosschain keeper
	app.CrosschainKeeper = crosschainkeeper.NewKeeper(
		app.appCodec,
		runtime.NewKVStoreService(app.GetKey(crosschaintypes.StoreKey)),
		app.Logger(),
		app.AuthKeeper,
		app.BankKeeper,
		app.TransferKeeper,
	)

	// Dex keeper
	govAddr, _ := app.AuthKeeper.AddressCodec().BytesToString(
		authtypes.NewModuleAddress(govtypes.ModuleName),
	)
	app.DexKeeper = dexkeeper.NewKeeper(
		runtime.NewKVStoreService(app.GetKey(dextypes.StoreKey)),
		app.appCodec,
		app.BankKeeper,
		govAddr,
	)

	// Governance keeper
	app.GovernanceKeeper = governancekeeper.NewKeeper(
		runtime.NewKVStoreService(app.GetKey(governancetypes.StoreKey)),
		app.appCodec,
		app.AuthKeeper.AddressCodec(),
		authtypes.NewModuleAddress(govtypes.ModuleName),
		app.BankKeeper,
		app.StakingKeeper,
	)

	// Wasmbridge keeper (MGP-20 bridge)
	wasmbridgeKeeper := wasmbridgekeeper.NewKeeper(
		runtime.NewKVStoreService(app.GetKey(wasmbridgetypes.StoreKey)),
		app.appCodec,
		app.AuthKeeper.AddressCodec(),
		app.MlcoinKeeper,
	)

	// Wasm keeper (code storage) - use depinject-provided keeper
	app.WasmKeeper = wasmkeeper.NewKeeper(
		runtime.NewKVStoreService(app.GetKey(wasmtypes.ModuleName)),
		app.appCodec,
		wasmbridgeKeeper,
	)

	if err := app.RegisterModules(
		crosschainmodule.NewAppModule(app.appCodec, app.CrosschainKeeper),
		dexmod.NewAppModule(app.appCodec, app.DexKeeper),
		governancemod.NewAppModule(app.appCodec, app.GovernanceKeeper),
		wasmbridgemodule.NewAppModule(app.appCodec, wasmbridgeKeeper),
		wasmdirectmodule.NewAppModule(app.appCodec, app.WasmKeeper),
	); err != nil {
		return err
	}

	return nil
}