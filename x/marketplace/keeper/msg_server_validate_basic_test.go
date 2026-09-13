package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/marketplace/keeper"
	mp "marketplace/x/marketplace/types"
)

var (
	buyerTestAddr  = sdk.AccAddress([]byte("buyer_test_address__")).String()
	sellerTestAddr = sdk.AccAddress([]byte("seller_test_address_")).String()
)

// Regression coverage: this SDK doesn't auto-invoke a message's
// ValidateBasic (the ante-handler decorator that used to do that was
// dropped from newer default chains) — so ValidateBasic methods existing
// on the message types means nothing unless something actually calls them.
// These prove msg_server.go does.

func TestMsgServerCreateEscrow_RejectsMalformedDenomWithoutPanicking(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := keeper.NewMsgServerImpl(k)

	resp, err := srv.CreateEscrow(ctx, &mp.MsgCreateEscrow{
		Buyer: buyerTestAddr, Seller: sellerTestAddr, Amount: "1000", Denom: "!!!invalid!!!",
	})
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestMsgServerCreateEscrow_RejectsSameBuyerAndSeller(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := keeper.NewMsgServerImpl(k)

	resp, err := srv.CreateEscrow(ctx, &mp.MsgCreateEscrow{
		Buyer: buyerTestAddr, Seller: buyerTestAddr, Amount: "1000", Denom: "uatom",
	})
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestMsgServerReleaseFunds_RejectsEmptyEscrowID(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := keeper.NewMsgServerImpl(k)

	resp, err := srv.ReleaseFunds(ctx, &mp.MsgReleaseFunds{EscrowId: "", ReleaseBy: buyerTestAddr})
	require.Error(t, err)
	require.Nil(t, resp)
}

func TestMsgServerOpenDispute_RejectsInvalidOpenerAddress(t *testing.T) {
	k, _, ctx := newTestKeeper(t)
	srv := keeper.NewMsgServerImpl(k)

	resp, err := srv.OpenDispute(ctx, &mp.MsgOpenDispute{EscrowId: "e1", Opener: "not-bech32"})
	require.Error(t, err)
	require.Nil(t, resp)
}
