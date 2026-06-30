package keeper_test

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	"marketplace/x/marketplace/keeper"
	mp "marketplace/x/marketplace/types"
)

type mockBankKeeper struct {
	balances map[string]sdk.Coins
}

func (m mockBankKeeper) SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	key := senderAddr.String()
	if m.balances[key] == nil {
		m.balances[key] = sdk.NewCoins()
	}
	if !m.balances[key].IsAllGTE(amt) {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = m.balances[key].Sub(amt...)
	modKey := "module_" + recipientModule
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	m.balances[modKey] = m.balances[modKey].Add(amt...)
	return nil
}

func (m mockBankKeeper) SendCoinsFromModuleToAccount(ctx context.Context, module string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modKey := "module_" + module
	if m.balances[modKey] == nil {
		m.balances[modKey] = sdk.NewCoins()
	}
	if !m.balances[modKey].IsAllGTE(amt) {
		return fmt.Errorf("insufficient module funds")
	}
	m.balances[modKey] = m.balances[modKey].Sub(amt...)
	recKey := recipient.String()
	if m.balances[recKey] == nil {
		m.balances[recKey] = sdk.NewCoins()
	}
	m.balances[recKey] = m.balances[recKey].Add(amt...)
	return nil
}

func newTestKeeper(t *testing.T) (keeper.Keeper, mockBankKeeper, sdk.Context) {
	t.Helper()
	storeKey := storetypes.NewKVStoreKey(mp.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	bank := mockBankKeeper{balances: make(map[string]sdk.Coins)}
	cdc := codec.NewProtoCodec(cdctypes.NewInterfaceRegistry())
	k := keeper.NewKeeper(
		storeService,
		cdc,
		bank,
	)

	return k, bank, ctx
}

func TestCreateEscrow(t *testing.T) {
	tests := []struct {
		name      string
		buyer     string
		seller    string
		amount    string
		denom     string
		desc      string
		dispute   uint64
		expectErr bool
		errSubstr string
	}{
		{
			name:   "successful escrow creation",
			buyer:  sdk.AccAddress([]byte("test_buyer_addr__________")).String(),
			seller: sdk.AccAddress([]byte("test_seller_addr_________")).String(),
			amount: "1000",
			denom:  "uatom",
			desc:   "Test escrow",
			dispute: 3600,
		},
		{
			name:      "invalid buyer address",
			buyer:     "invalid",
			seller:    sdk.AccAddress([]byte("test_seller_addr_________")).String(),
			amount:    "1000",
			denom:     "uatom",
			expectErr: true,
			errSubstr: "invalid buyer address",
		},
		{
			name:      "zero amount",
			buyer:     sdk.AccAddress([]byte("test_buyer_addr__________")).String(),
			seller:    sdk.AccAddress([]byte("test_seller_addr_________")).String(),
			amount:    "0",
			denom:     "uatom",
			expectErr: true,
			errSubstr: "amount must be positive",
		},
		{
			name:      "negative amount",
			buyer:     sdk.AccAddress([]byte("test_buyer_addr__________")).String(),
			seller:    sdk.AccAddress([]byte("test_seller_addr_________")).String(),
			amount:    "-100",
			denom:     "uatom",
			expectErr: true,
			errSubstr: "amount must be positive",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			k, bank, ctx := newTestKeeper(t)
			if tc.amount != "0" && tc.amount != "-100" && !tc.expectErr {
				bank.balances[tc.buyer] = sdk.NewCoins(sdk.NewCoin(tc.denom, math.NewInt(1000)))
			}

			escrowID, err := k.CreateEscrow(ctx, tc.buyer, tc.seller, tc.amount, tc.denom, tc.desc, tc.dispute)
			if tc.expectErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tc.errSubstr)
				assert.Empty(t, escrowID)
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, escrowID)
			}
		})
	}
}

func TestReleaseFunds(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	buyer := sdk.AccAddress([]byte("test_buyer_addr__________")).String()
	seller := sdk.AccAddress([]byte("test_seller_addr_________")).String()
	bank.balances[buyer] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))

	escrowID, err := k.CreateEscrow(ctx, buyer, seller, "1000", "uatom", "Test escrow", 3600)
	require.NoError(t, err)

	err = k.ReleaseFunds(ctx, escrowID, seller)
	assert.NoError(t, err)

	escrow, err := k.GetEscrow(ctx, escrowID)
	assert.NoError(t, err)
	assert.Equal(t, mp.StatusReleased, escrow.Status)
}

func TestRefundBuyer(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	buyer := sdk.AccAddress([]byte("test_buyer_addr__________")).String()
	seller := sdk.AccAddress([]byte("test_seller_addr_________")).String()
	bank.balances[buyer] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))

	escrowID, err := k.CreateEscrow(ctx, buyer, seller, "1000", "uatom", "Test escrow", 3600)
	require.NoError(t, err)

	err = k.RefundBuyer(ctx, escrowID)
	assert.NoError(t, err)

	escrow, err := k.GetEscrow(ctx, escrowID)
	assert.NoError(t, err)
	assert.Equal(t, mp.StatusRefunded, escrow.Status)
}

func TestOpenDispute(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	buyer := sdk.AccAddress([]byte("test_buyer_addr__________")).String()
	seller := sdk.AccAddress([]byte("test_seller_addr_________")).String()
	bank.balances[buyer] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))

	escrowID, err := k.CreateEscrow(ctx, buyer, seller, "1000", "uatom", "Test escrow", 3600)
	require.NoError(t, err)

	err = k.OpenDispute(ctx, escrowID, buyer)
	assert.NoError(t, err)

	escrow, err := k.GetEscrow(ctx, escrowID)
	assert.NoError(t, err)
	assert.Equal(t, mp.StatusDisputed, escrow.Status)
}

func TestOpenDisputeUnauthorized(t *testing.T) {
	k, bank, ctx := newTestKeeper(t)
	buyer := sdk.AccAddress([]byte("test_buyer_addr__________")).String()
	seller := sdk.AccAddress([]byte("test_seller_addr_________")).String()
	bank.balances[buyer] = sdk.NewCoins(sdk.NewCoin("uatom", math.NewInt(1000)))

	escrowID, err := k.CreateEscrow(ctx, buyer, seller, "1000", "uatom", "Test escrow", 3600)
	require.NoError(t, err)

	err = k.OpenDispute(ctx, escrowID, seller)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "only buyer can open dispute")
}

func TestGetAllEscrows(t *testing.T) {
	k, _, ctx := newTestKeeper(t)

	escrows, err := k.GetAllEscrows(ctx)
	assert.NoError(t, err)
	assert.Empty(t, escrows)
}
