package app

import (
	"fmt"

	storetypes "cosmossdk.io/store/types"

	"github.com/cosmos/cosmos-sdk/runtime"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	crosschainmodule "marketplace/x/crosschain/module"
	crosschainmodulekeeper "marketplace/x/crosschain/keeper"
	crosschainmoduletypes "marketplace/x/crosschain/types"

	dexmodule "marketplace/x/dex"
	dexmodulekeeper "marketplace/x/dex/keeper"
	dexmoduletypes "marketplace/x/dex/types"

	governancemodule "marketplace/x/governance"
	governancemodulekeeper "marketplace/x/governance/keeper"
	governancemoduletypes "marketplace/x/governance/types"

	marketplacemodule "marketplace/x/marketplace"
	marketplacemodulekeeper "marketplace/x/marketplace/keeper"
	marketplacemoduletypes "marketplace/x/marketplace/types"

	wasmmodule "marketplace/x/wasm/module"
	wasmmodulekeeper "marketplace/x/wasm/keeper"
	wasmmoduletypes "marketplace/x/wasm/types"

	wasmbridgemodule "marketplace/x/wasmbridge/module"
	wasmbridgemodulekeeper "marketplace/x/wasmbridge/keeper"
	wasmbridgemoduletypes "marketplace/x/wasmbridge/types"

	vaultmodule "marketplace/x/vault/module"
	vaultmodulekeeper "marketplace/x/vault/keeper"
	vaultmoduletypes "marketplace/x/vault/types"
)

// registerCustomModules wires up modules that don't (yet) use the app-config-v2
// depinject Module config pattern (see the note in app_config.go). These are
// constructed and registered here, after appBuilder.Build() but before
// app.Load(), following the SDK's documented hybrid-wiring pattern:
// (*runtime.App).RegisterStores() to mount extra KVStores, and
// (*runtime.App).RegisterModules() to add the module to the ModuleManager and
// register its Msg/Query services with the app's routers.
//
func (app *App) registerCustomModules() error {
	dexKey := storetypes.NewKVStoreKey(dexmoduletypes.StoreKey)
	crosschainKey := storetypes.NewKVStoreKey(crosschainmoduletypes.StoreKey)
	governanceKey := storetypes.NewKVStoreKey(governancemoduletypes.StoreKey)
	marketplaceKey := storetypes.NewKVStoreKey(marketplacemoduletypes.StoreKey)
	wasmbridgeKey := storetypes.NewKVStoreKey(wasmbridgemoduletypes.StoreKey)
	wasmKey := storetypes.NewKVStoreKey(wasmmoduletypes.StoreKey)
	vaultKey := storetypes.NewKVStoreKey(vaultmoduletypes.StoreKey)

	if err := app.RegisterStores(dexKey, crosschainKey, governanceKey, marketplaceKey, wasmbridgeKey, wasmKey, vaultKey); err != nil {
		return fmt.Errorf("registering custom module stores: %w", err)
	}

	govAuthority := authtypes.NewModuleAddress(governancemoduletypes.ModuleName)

	dexKeeper, err := dexmodulekeeper.NewKeeper(
		runtime.NewKVStoreService(dexKey),
		app.appCodec,
		app.BankKeeper,
		govAuthority.String(),
	)
	if err != nil {
		return fmt.Errorf("constructing dex keeper: %w", err)
	}
	app.DexKeeper = dexKeeper

	crosschainKeeper, err := crosschainmodulekeeper.NewKeeper(
		app.appCodec,
		runtime.NewKVStoreService(crosschainKey),
		app.Logger(),
		app.AuthKeeper,
		app.BankKeeper,
		app.TransferKeeper,
		app.StakingKeeper,
		app.IBCKeeper.ClientKeeper,
	)
	if err != nil {
		return fmt.Errorf("constructing crosschain keeper: %w", err)
	}
	app.CrosschainKeeper = crosschainKeeper

	governanceKeeper, err := governancemodulekeeper.NewKeeper(
		runtime.NewKVStoreService(governanceKey),
		app.appCodec,
		app.AuthKeeper.AddressCodec(),
		govAuthority.Bytes(),
		app.BankKeeper,
		app.StakingKeeper,
		app.MsgServiceRouter(),
	)
	if err != nil {
		return fmt.Errorf("constructing governance keeper: %w", err)
	}
	app.GovernanceKeeper = governanceKeeper

	marketplaceKeeper := marketplacemodulekeeper.NewKeeper(
		runtime.NewKVStoreService(marketplaceKey),
		app.appCodec,
		app.BankKeeper,
	)
	app.MarketplaceKeeper = marketplaceKeeper

	// x/wasm's host ABI gives contracts MGP20 token access through
	// x/wasmbridge, so the bridge keeper must exist first.
	wasmbridgeKeeper, err := wasmbridgemodulekeeper.NewKeeper(
		runtime.NewKVStoreService(wasmbridgeKey),
		app.appCodec,
		app.AuthKeeper.AddressCodec(),
		app.MlcoinKeeper,
	)
	if err != nil {
		return fmt.Errorf("constructing wasmbridge keeper: %w", err)
	}
	app.WasmbridgeKeeper = wasmbridgeKeeper

	wasmKeeper, err := wasmmodulekeeper.NewKeeper(
		runtime.NewKVStoreService(wasmKey),
		app.appCodec,
		app.WasmbridgeKeeper,
	)
	if err != nil {
		return fmt.Errorf("constructing wasm keeper: %w", err)
	}
	app.WasmKeeper = wasmKeeper

	// vault is wired manually rather than via its own depinject.go (removed):
	// x/vault/types/module.pb.go's Module type lacks a valid
	// cosmos.app.v1alpha1.module protobuf extension, which makes
	// depinject/appconfig.Compose() panic unconditionally for the whole app
	// the instant that package's appconfig.Register() init() runs — see
	// x/vault/module/module.go's IsOnePerModuleType comment.
	app.VaultKeeper = vaultmodulekeeper.NewKeeper(runtime.NewKVStoreService(vaultKey), app.appCodec)

	dexAppModule := dexmodule.NewAppModule(app.appCodec, app.DexKeeper)
	crosschainAppModule := crosschainmodule.NewAppModule(app.appCodec, app.CrosschainKeeper)
	governanceAppModule := governancemodule.NewAppModule(app.appCodec, app.GovernanceKeeper)
	marketplaceAppModule := marketplacemodule.NewAppModule(app.appCodec, app.MarketplaceKeeper)
	wasmbridgeAppModule := wasmbridgemodule.NewAppModule(app.appCodec, app.WasmbridgeKeeper)
	wasmAppModule := wasmmodule.NewAppModule(app.appCodec, app.WasmKeeper)
	vaultAppModule := vaultmodule.NewAppModule(app.appCodec, app.VaultKeeper)

	if err := app.RegisterModules(
		dexAppModule,
		crosschainAppModule,
		governanceAppModule,
		marketplaceAppModule,
		wasmbridgeAppModule,
		wasmAppModule,
		vaultAppModule,
	); err != nil {
		return fmt.Errorf("registering custom modules: %w", err)
	}

	// Genesis/begin-block/end-block ordering for these modules is declared
	// statically in app_config.go's InitGenesis/EndBlockers lists, not
	// appended here: runtime.App.Load() unconditionally calls
	// ModuleManager.SetOrderInitGenesis(a.config.InitGenesis...) (and the
	// same for ExportGenesis/EndBlockers) using that *static* list, which
	// OVERWRITES (not merges with) OrderInitGenesis — so appending here,
	// before Load() runs, would just get silently discarded. Confirmed via
	// TestAnteStoreKeyIsMounted actually constructing a real App: Load()
	// itself panics ("all modules must be defined") if a module registered
	// above is missing from the static list, since SetOrderInitGenesis
	// validates its argument covers every HasGenesis-implementing module
	// already in ModuleManager.Modules at call time.
	return nil
}
