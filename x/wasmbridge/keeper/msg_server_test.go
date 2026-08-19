package keeper_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	wasmbridgekeeper "marketplace/x/wasmbridge/keeper"
	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

// Regression coverage for a fund-drain bug: MsgExecuteAction is signed only
// by `sender`, but the action payloads (transfer/approve/transfer_from)
// carry their own from/owner/spender field. Without checking that the
// signer matches that field, any account could move funds out of any other
// account's wallet or allowance.
func TestExecuteAction_RejectsSpoofedSender(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)
	msgServer := wasmbridgekeeper.NewMsgServerImpl(*k)

	attacker := newTestAddress("attacker")
	victim := newTestAddress("victim")
	someoneElse := newTestAddress("someone-else")

	t.Run("transfer: sender must equal from", func(t *testing.T) {
		payload, err := json.Marshal(wasmbridgetypes.MGP20TransferMsg{From: victim, To: attacker, Amount: 100})
		require.NoError(t, err)

		_, err = msgServer.ExecuteAction(ctx, &wasmbridgetypes.MsgExecuteAction{
			Sender:  attacker,
			Action:  wasmbridgetypes.ActionTransfer,
			Message: payload,
		})
		require.ErrorIs(t, err, wasmbridgetypes.ErrUnauthorized)
	})

	t.Run("approve: sender must equal owner", func(t *testing.T) {
		payload, err := json.Marshal(wasmbridgetypes.MGP20ApproveMsg{Owner: victim, Spender: attacker, Amount: 100})
		require.NoError(t, err)

		_, err = msgServer.ExecuteAction(ctx, &wasmbridgetypes.MsgExecuteAction{
			Sender:  attacker,
			Action:  wasmbridgetypes.ActionApprove,
			Message: payload,
		})
		require.ErrorIs(t, err, wasmbridgetypes.ErrUnauthorized)
	})

	t.Run("transfer_from: sender must equal spender", func(t *testing.T) {
		payload, err := json.Marshal(wasmbridgetypes.MGP20TransferFromMsg{Owner: victim, Spender: someoneElse, Recipient: attacker, Amount: 100})
		require.NoError(t, err)

		_, err = msgServer.ExecuteAction(ctx, &wasmbridgetypes.MsgExecuteAction{
			Sender:  attacker,
			Action:  wasmbridgetypes.ActionTransferFrom,
			Message: payload,
		})
		require.ErrorIs(t, err, wasmbridgetypes.ErrUnauthorized)
	})
}

func TestExecuteAction_AllowsMatchingSender(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)
	msgServer := wasmbridgekeeper.NewMsgServerImpl(*k)

	owner := newTestAddress("owner")
	spender := newTestAddress("spender")

	payload, err := json.Marshal(wasmbridgetypes.MGP20ApproveMsg{Owner: owner, Spender: spender, Amount: 100})
	require.NoError(t, err)

	_, err = msgServer.ExecuteAction(ctx, &wasmbridgetypes.MsgExecuteAction{
		Sender:  owner,
		Action:  wasmbridgetypes.ActionApprove,
		Message: payload,
	})
	require.NoError(t, err)
}
