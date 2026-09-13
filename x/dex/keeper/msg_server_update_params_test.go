package keeper

import (
	"testing"

	"github.com/stretchr/testify/require"

	"marketplace/x/dex/types"
)

// Regression coverage: UpdateParams checked only that msg.Params was
// non-nil, never that its contents were valid — a governance-passed update
// with MinFee > MaxFee (or a non-numeric fee string) would be accepted and
// persisted, only breaking later, wherever swap code actually parses those
// fields with the panicking math.LegacyMustNewDecFromStr.

func TestMsgServerUpdateParams_RejectsInvalidParams(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := NewMsgServerImpl(k)

	badParams := types.DefaultParams()
	badParams.MinFee = "0.05"
	badParams.MaxFee = "0.01" // min > max

	resp, err := srv.UpdateParams(ctx, &types.MsgUpdateParams{
		Authority: "authority_address",
		Params:    &badParams,
	})
	require.Error(t, err)
	require.Nil(t, resp)

	// The bad params must not have been persisted.
	current, err := k.GetParams(ctx)
	require.NoError(t, err)
	require.Equal(t, types.DefaultParams().MinFee, current.MinFee)
}

func TestMsgServerUpdateParams_AcceptsValidParams(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := NewMsgServerImpl(k)

	newParams := types.DefaultParams()
	newParams.MinFee = "0.0005"
	newParams.MaxFee = "0.02"
	newParams.DefaultFee = "0.005"

	resp, err := srv.UpdateParams(ctx, &types.MsgUpdateParams{
		Authority: "authority_address",
		Params:    &newParams,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	current, err := k.GetParams(ctx)
	require.NoError(t, err)
	require.Equal(t, "0.005", current.DefaultFee)
}
