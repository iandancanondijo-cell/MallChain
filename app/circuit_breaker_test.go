package app

import (
	"testing"

	"cosmossdk.io/log"
	circuitante "cosmossdk.io/x/circuit/ante"

	dbm "github.com/cosmos/cosmos-db"
	sdk "github.com/cosmos/cosmos-sdk/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/stretchr/testify/require"
	protov2 "google.golang.org/protobuf/proto"
)

// stubTx is a minimal sdk.Tx carrying a single message — sufficient for
// CircuitBreakerDecorator.AnteHandle, which only calls tx.GetMsgs().
type stubTx struct{ msg sdk.Msg }

func (s stubTx) GetMsgs() []sdk.Msg                    { return []sdk.Msg{s.msg} }
func (s stubTx) GetMsgsV2() ([]protov2.Message, error) { return nil, nil }

// TestCircuitBreakerBlocksDisabledMsgType locks in the fix for x/circuit's
// CircuitBreakerKeeper being registered (app.CircuitBreakerKeeper) but its
// enforcement decorator never being wired into the ante handler chain —
// meaning pausing a message type via governance/authority would previously
// have had zero real effect on transaction processing. This builds the exact
// decorator app.go's wrappedAnte now wraps around (circuitante.NewCircuitBreakerDecorator(&app.CircuitBreakerKeeper))
// against the app's real, live CircuitBreakerKeeper and confirms: (1) an
// undisabled message type reaches "next", and (2) a message type disabled
// via the keeper's DisableList — the same state MsgTripCircuitBreaker
// mutates — is rejected before "next" ever runs.
func TestCircuitBreakerBlocksDisabledMsgType(t *testing.T) {
	testApp := New(log.NewNopLogger(), dbm.NewMemDB(), nil, true, stubAppOptions{})
	require.NotNil(t, testApp)

	msg := &banktypes.MsgSend{FromAddress: "mall1abc", ToAddress: "mall1def"}
	msgURL := sdk.MsgTypeURL(msg)
	tx := stubTx{msg: msg}
	ctx := testApp.NewContext(true)

	decorator := circuitante.NewCircuitBreakerDecorator(&testApp.CircuitBreakerKeeper)

	nextCalled := false
	next := func(ctx sdk.Context, tx sdk.Tx, simulate bool) (sdk.Context, error) {
		nextCalled = true
		return ctx, nil
	}

	_, err := decorator.AnteHandle(ctx, tx, false, next)
	require.NoError(t, err, "undisabled message type must pass the circuit breaker check")
	require.True(t, nextCalled, "undisabled message type must reach the rest of the ante chain")

	require.NoError(t, testApp.CircuitBreakerKeeper.DisableList.Set(ctx, msgURL))

	nextCalled = false
	_, err = decorator.AnteHandle(ctx, tx, false, next)
	require.Error(t, err, "ante handler must reject a tx whose message type was disabled via the circuit breaker")
	require.False(t, nextCalled, "a disabled message type must never reach the rest of the ante chain")
}
