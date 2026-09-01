package app

import (
	"testing"

	"cosmossdk.io/log"
	dbm "github.com/cosmos/cosmos-db"
	"github.com/stretchr/testify/require"
)

// Locks in that setupUpgradeHandlers actually registers the template
// handler on the app's real UpgradeKeeper — before this, no
// SetUpgradeHandler call existed anywhere, so any governance-approved
// software-upgrade plan would halt the node at its target height with
// "UPGRADE ... NEEDED" and no handler able to run, since x/upgrade refuses
// to apply a plan with no matching handler registered.
func TestUpgradeHandlerIsRegistered(t *testing.T) {
	testApp := New(log.NewNopLogger(), dbm.NewMemDB(), nil, true, stubAppOptions{})
	require.NotNil(t, testApp)

	require.True(t, testApp.UpgradeKeeper.HasHandler(upgradeNameV2),
		"expected an upgrade handler registered for plan %q", upgradeNameV2)
	require.False(t, testApp.UpgradeKeeper.HasHandler("some-plan-that-was-never-registered"))
}
