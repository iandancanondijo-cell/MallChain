package app

import (
	"context"
	"fmt"

	storetypes "cosmossdk.io/store/types"
	upgradetypes "cosmossdk.io/x/upgrade/types"
	"github.com/cosmos/cosmos-sdk/types/module"
)

// Chain upgrades (governance-approved software-upgrade proposals) need a
// handler registered for the plan's exact name *before* the chain reaches
// the scheduled upgrade height — without one, x/upgrade halts the node at
// that height with "UPGRADE ... NEEDED" and refuses to proceed, which is
// the safe failure mode but means no in-place upgrade has ever actually
// been prepared or tested for this chain.
//
// TEMPLATE — not a real upgrade. "v2" is a placeholder name so this
// compiles and has test coverage; nothing currently schedules a v2 plan.
// When a real upgrade is planned:
//  1. Copy this pattern under a new name matching the exact plan name the
//     governance proposal will use.
//  2. Add real logic to the handler below — e.g. app.BadgeKeeper.SetParams(...)
//     for a new param, or nothing at all if the upgrade only bumps consensus
//     version with no state changes.
//  3. If any module's store layout changed (added/renamed a module), add a
//     case for the new plan name in setupUpgradeStoreLoaders below with its
//     storetypes.StoreUpgrades — a bare version bump with no store changes
//     needs no entry there.
//  4. Delete the old template registration once the upgrade has actually
//     happened on every network that needs it (mainnet included) — keeping
//     handlers for upgrades already past their height around forever is
//     dead weight, not safety.
const upgradeNameV2 = "v2"

func (app *App) setupUpgradeHandlers() {
	app.UpgradeKeeper.SetUpgradeHandler(
		upgradeNameV2,
		func(ctx context.Context, _ upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
			// No state migration needed for this template — a real upgrade
			// with new module state would call the relevant keeper's
			// migration/init logic here before returning the version map.
			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
		},
	)
}

// setupUpgradeStoreLoaders wires baseapp's store loader to add/rename/delete
// KVStore keys at the exact height a store-changing upgrade takes effect.
// Without this, adding a new module in an upgrade would panic on restart
// ("store does not exist") because nothing ever told baseapp's multistore to
// mount it — SetUpgradeHandler alone only runs in-state migrations, it does
// not touch the underlying store layout.
//
// This must run before app.Load() (see the call site in app.go) since it
// configures *how* the multistore loads, not something that can be patched
// in afterward.
//
// Safe to call unconditionally on every startup: ReadUpgradeInfoFromDisk
// returns a zero-value Plan (Name="", Height=0) when no upgrade has ever
// been applied on this node, which matches no case below and leaves
// baseapp's default store loader untouched.
func (app *App) setupUpgradeStoreLoaders() {
	upgradeInfo, err := app.UpgradeKeeper.ReadUpgradeInfoFromDisk()
	if err != nil {
		panic(fmt.Sprintf("failed to read upgrade info from disk: %s", err))
	}

	if app.UpgradeKeeper.IsSkipHeight(upgradeInfo.Height) {
		return
	}

	var storeUpgrades *storetypes.StoreUpgrades

	switch upgradeInfo.Name {
	case upgradeNameV2:
		// TEMPLATE — v2 is a bare version bump with no store changes, so it
		// intentionally registers no StoreUpgrades. A real upgrade that adds
		// a module needs: storeUpgrades = &storetypes.StoreUpgrades{Added: []string{"newmodule"}}
	}

	if storeUpgrades != nil {
		app.SetStoreLoader(upgradetypes.UpgradeStoreLoader(upgradeInfo.Height, storeUpgrades))
	}
}
