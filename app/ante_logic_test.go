package app

import (
	"testing"

	dbm "github.com/cosmos/cosmos-db"
	"github.com/stretchr/testify/require"

	"cosmossdk.io/log"
)

type stubAppOptions struct{}

func (stubAppOptions) Get(string) any { return nil }

// TestAnteStoreKeyIsMounted locks in the fix for the ante rate-limit/replay
// wrapper's precondition never actually being satisfied: anteStoreKey was
// constructed in New() but never passed to RegisterStores/MountKVStores, so
// app.GetKey(anteStoreKey.Name()) always returned nil and wrappedAnte's
// rate-limit/replay logic silently no-opped on every transaction. A full
// ABCI-cycle integration test (submit txs through the real ante handler) is
// left for later — constructing/driving a complete app through InitChain
// was flagged as unstable in this workspace (see the removed skip above);
// this test targets the exact precondition that was broken without needing
// a full chain lifecycle.
func TestAnteStoreKeyIsMounted(t *testing.T) {
	testApp := New(log.NewNopLogger(), dbm.NewMemDB(), nil, true, stubAppOptions{})
	require.NotNil(t, testApp)
	require.NotNil(t, testApp.GetKey("ante"), "ante store key must be mounted for rate-limit/replay protection to activate")
}
