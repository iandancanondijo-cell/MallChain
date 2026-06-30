package keeper_test

import (
	"context"
	"testing"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"

	mlcoinkeeper "marketplace/x/mlcoin/keeper"
	mlcointypes "marketplace/x/mlcoin/types"
	wasmbridgekeeper "marketplace/x/wasmbridge/keeper"
	wasmbridgetypes "marketplace/x/wasmbridge/types"
)

func newWasmbridgeTestKeeper(t *testing.T) (*wasmbridgekeeper.Keeper, context.Context) {
	t.Helper()
	cdc := codec.NewProtoCodec(nil)
	addressCdc := addresscodec.NewBech32Codec("cosmos")

	wasmbridgeStoreKey := storetypes.NewKVStoreKey(wasmbridgetypes.StoreKey)
	wasmbridgeStoreService := runtime.NewKVStoreService(wasmbridgeStoreKey)
	ctx := testutil.DefaultContextWithDB(t, wasmbridgeStoreKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	mlcoinStoreKey := storetypes.NewKVStoreKey(mlcointypes.StoreKey)
	mlcoinStoreService := runtime.NewKVStoreService(mlcoinStoreKey)

	mlcoinK := mlcoinkeeper.NewKeeper(
		mlcoinStoreService,
		cdc,
		addressCdc,
		sdk.AccAddress([]byte("gov")).Bytes(),
		mlcointypes.AuthKeeper{},
		mlcointypes.BankKeeper{},
	)

	k, err := wasmbridgekeeper.NewKeeper(
		wasmbridgeStoreService,
		cdc,
		addressCdc,
		&mlcoinK,
	)
	require.NoError(t, err)

	return &k, ctx
}

func newTestAddress(name string) string {
	addr := sdk.AccAddress([]byte(name))
	return addr.String()
}

func TestHandleTransfer(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)

	senderAddr := newTestAddress("sender")
	recipientAddr := newTestAddress("recipient")

	err := k.HandleTransfer(ctx, wasmbridgetypes.MGP20TransferMsg{
		From:   senderAddr,
		To:     recipientAddr,
		Amount: 100,
	})
	assert.Error(t, err) // Expects error because wallet doesn't exist
}

func TestQueryBalance(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)

	testAddr := newTestAddress("test")
	balance, err := k.QueryBalance(ctx, testAddr)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, balance, uint64(0))
}

func TestHandleApprove(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)

	ownerAddr := newTestAddress("owner")
	spenderAddr := newTestAddress("spender")

	err := k.HandleApprove(ctx, wasmbridgetypes.MGP20ApproveMsg{
		Owner:   ownerAddr,
		Spender: spenderAddr,
		Amount:  50,
	})
	assert.NoError(t, err)
}

func TestHandleTransferFrom(t *testing.T) {
	k, ctx := newWasmbridgeTestKeeper(t)

	ownerAddr := newTestAddress("owner")
	spenderAddr := newTestAddress("spender")
	recipientAddr := newTestAddress("recipient")

	err := k.HandleTransferFrom(ctx, wasmbridgetypes.MGP20TransferFromMsg{
		Owner:     ownerAddr,
		Spender:   spenderAddr,
		Recipient: recipientAddr,
		Amount:    50,
	})
	assert.Error(t, err) // Expects error because wallet doesn't exist
}