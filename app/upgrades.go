package app

import (
	"context"

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
//  3. If any module's store layout changed (added/renamed a module), list it
//     in upgradeStoreLoader's storetypes.StoreUpgrades — a bare version bump
//     with no store changes needs no entry there.
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
