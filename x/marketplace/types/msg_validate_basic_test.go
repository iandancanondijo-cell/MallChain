package types_test

import (
	"strings"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/marketplace/types"
)

// Regression coverage: none of these four message types had a
// ValidateBasic at all — every field (denom in particular, which reaches
// keeper CreateEscrow's sdk.NewCoin call and PANICS on a malformed denom)
// went straight to keeper logic with no upfront well-formedness check.

var (
	buyerAddr  = sdk.AccAddress([]byte("buyer_address_______")).String()
	sellerAddr = sdk.AccAddress([]byte("seller_address______")).String()
)

func TestMsgCreateEscrow_ValidateBasic(t *testing.T) {
	base := func() types.MsgCreateEscrow {
		return types.MsgCreateEscrow{Buyer: buyerAddr, Seller: sellerAddr, Amount: "1000", Denom: "uatom", Description: "d"}
	}

	t.Run("valid", func(t *testing.T) {
		msg := base()
		require.NoError(t, msg.ValidateBasic())
	})
	t.Run("invalid buyer", func(t *testing.T) {
		msg := base()
		msg.Buyer = "not-bech32"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("invalid seller", func(t *testing.T) {
		msg := base()
		msg.Seller = "not-bech32"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("buyer equals seller", func(t *testing.T) {
		msg := base()
		msg.Seller = msg.Buyer
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("malformed denom does not panic and is rejected", func(t *testing.T) {
		msg := base()
		msg.Denom = "!!!"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("non-numeric amount", func(t *testing.T) {
		msg := base()
		msg.Amount = "abc"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("zero amount", func(t *testing.T) {
		msg := base()
		msg.Amount = "0"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("negative amount", func(t *testing.T) {
		msg := base()
		msg.Amount = "-5"
		require.Error(t, msg.ValidateBasic())
	})
	t.Run("description too long", func(t *testing.T) {
		msg := base()
		msg.Description = strings.Repeat("x", 2001)
		require.Error(t, msg.ValidateBasic())
	})
}

func TestMsgReleaseFunds_ValidateBasic(t *testing.T) {
	require.NoError(t, (&types.MsgReleaseFunds{EscrowId: "e1", ReleaseBy: buyerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgReleaseFunds{EscrowId: "", ReleaseBy: buyerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgReleaseFunds{EscrowId: "e1", ReleaseBy: "not-bech32"}).ValidateBasic())
}

func TestMsgRefundBuyer_ValidateBasic(t *testing.T) {
	require.NoError(t, (&types.MsgRefundBuyer{EscrowId: "e1", RequestedBy: sellerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgRefundBuyer{EscrowId: "", RequestedBy: sellerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgRefundBuyer{EscrowId: "e1", RequestedBy: "not-bech32"}).ValidateBasic())
}

func TestMsgOpenDispute_ValidateBasic(t *testing.T) {
	require.NoError(t, (&types.MsgOpenDispute{EscrowId: "e1", Opener: buyerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgOpenDispute{EscrowId: "", Opener: buyerAddr}).ValidateBasic())
	require.Error(t, (&types.MsgOpenDispute{EscrowId: "e1", Opener: "not-bech32"}).ValidateBasic())
}
