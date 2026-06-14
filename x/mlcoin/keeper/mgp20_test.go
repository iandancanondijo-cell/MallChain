package keeper_test

import (
	"errors"
	"testing"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	mlcoinmodule "marketplace/x/mlcoin/module"
	"marketplace/x/mlcoin/types"
)

// testAddr generates a valid test address from a byte prefix
func testAddr(prefix byte) string {
	return sdk.AccAddress([]byte{
		prefix, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
	}).String()
}

func TestApproveAndTransferFrom(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	authorityAddr, err := addressCodec.StringToBytes(sdk.AccAddress([]byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}).String())
	require.NoError(t, err)

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authorityAddr,
		types.AuthKeeper{},
		types.BankKeeper{},
	)

	owner := testAddr(0x21)
	spender := testAddr(0x41)
	recipient := testAddr(0x61)

	require.NoError(t, k.WalletBalance.Set(ctx, owner, types.WalletBalance{Address: owner, Balance: 1_000}))

	require.NoError(t, k.Approve(ctx, owner, spender, 500))

	allowance, err := k.GetAllowance(ctx, owner, spender)
	require.NoError(t, err)
	require.Equal(t, uint64(500), allowance)

	require.NoError(t, k.TransferFrom(ctx, owner, spender, recipient, 200))

	ownerWallet, err := k.WalletBalance.Get(ctx, owner)
	require.NoError(t, err)
	require.Equal(t, uint64(800), ownerWallet.Balance)

	recipientWallet, err := k.WalletBalance.Get(ctx, recipient)
	require.NoError(t, err)
	require.Equal(t, uint64(200), recipientWallet.Balance)

	remainingAllowance, err := k.GetAllowance(ctx, owner, spender)
	require.NoError(t, err)
	require.Equal(t, uint64(300), remainingAllowance)
}

func TestTransferFromFailsWhenAllowanceTooLow(t *testing.T) {
	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	authorityAddr, err := addressCodec.StringToBytes(sdk.AccAddress([]byte{0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18}).String())
	require.NoError(t, err)

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authorityAddr,
		types.AuthKeeper{},
		types.BankKeeper{},
	)

	owner := testAddr(0x25)
	spender := testAddr(0x45)
	recipient := testAddr(0x65)

	require.NoError(t, k.WalletBalance.Set(ctx, owner, types.WalletBalance{Address: owner, Balance: 1_000}))
	require.NoError(t, k.Approve(ctx, owner, spender, 100))

	err = k.TransferFrom(ctx, owner, spender, recipient, 200)
	require.Error(t, err)
	require.True(t, errors.Is(err, types.ErrInsufficientAllowance))
}
