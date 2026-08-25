package keeper_test

import (
	"testing"

	"github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/badge/keeper"
	badgetypes "marketplace/x/badge/types"
)

// Regression coverage for a fund/privilege-escalation bug: MsgIssueBadge
// used to accept any well-formed `creator` address with no authorization
// check at all, so any account could self-issue itself a badge for free.

func TestIssueBadge_RejectsUnconfiguredIssuer(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := types.AccAddress([]byte("creator_____________")).String()
	recipient := types.AccAddress([]byte("recipient___________")).String()

	_, err := ms.IssueBadge(f.ctx, &badgetypes.MsgIssueBadge{
		Creator:   creator,
		Recipient: recipient,
		BadgeType: "gold",
	})
	require.ErrorIs(t, err, badgetypes.ErrUnauthorizedIssuer)
}

func TestIssueBadge_RejectsCreatorThatIsNotTheConfiguredIssuer(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	issuer := types.AccAddress([]byte("real_issuer_________")).String()
	attacker := types.AccAddress([]byte("attacker____________")).String()
	recipient := types.AccAddress([]byte("recipient___________")).String()

	require.NoError(t, f.keeper.Params.Set(f.ctx, badgetypes.Params{BadgeIssuer: issuer}))

	_, err := ms.IssueBadge(f.ctx, &badgetypes.MsgIssueBadge{
		Creator:   attacker,
		Recipient: recipient,
		BadgeType: "gold",
	})
	require.ErrorIs(t, err, badgetypes.ErrUnauthorizedIssuer)
}

func TestIssueBadge_AllowsConfiguredIssuer(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	issuer := types.AccAddress([]byte("real_issuer_________")).String()
	recipient := types.AccAddress([]byte("recipient___________")).String()

	require.NoError(t, f.keeper.Params.Set(f.ctx, badgetypes.Params{BadgeIssuer: issuer}))

	_, err := ms.IssueBadge(f.ctx, &badgetypes.MsgIssueBadge{
		Creator:   issuer,
		Recipient: recipient,
		BadgeType: "gold",
	})
	require.NoError(t, err)

	badge, err := f.keeper.UserBadge.Get(f.ctx, recipient)
	require.NoError(t, err)
	require.True(t, badge.HasBadge)
	require.Equal(t, "gold", badge.BadgeType)
}

func TestIssueBadge_StillRejectsReissueEvenForConfiguredIssuer(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	issuer := types.AccAddress([]byte("real_issuer_________")).String()
	recipient := types.AccAddress([]byte("recipient___________")).String()

	require.NoError(t, f.keeper.Params.Set(f.ctx, badgetypes.Params{BadgeIssuer: issuer}))

	msg := &badgetypes.MsgIssueBadge{Creator: issuer, Recipient: recipient, BadgeType: "gold"}
	_, err := ms.IssueBadge(f.ctx, msg)
	require.NoError(t, err)

	_, err = ms.IssueBadge(f.ctx, msg)
	require.ErrorIs(t, err, badgetypes.ErrBadgeAlreadyIssued)
}
