package keeper_test

import (
	"testing"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/std"
	"github.com/cosmos/cosmos-sdk/testutil/integration"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/stretchr/testify/require"

	cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
	"cosmossdk.io/log"

	"marketplace/x/mlcoin/keeper"
	mlcoinmodule "marketplace/x/mlcoin/module"
	"marketplace/x/mlcoin/types"
)

// Regression coverage for two real, LIVE bugs found while investigating why
// this chain's node crashed on restart at height 12000 (the first block
// where EmissionTickBlocks/ConversionTickBlocks — both 12000 by default —
// ever fired DistributeFees with a nonzero amount to send):
//
//  1. "mlcoin" had no entry in app_config.go's moduleAccPerms. Bank's
//     SendCoinsFromModuleToAccount PANICS (not just errors — see its own
//     doc comment) when the sender module isn't a registered account,
//     which crashed the whole node, not just this one EndBlocker call.
//  2. Even with that fixed, AccumulateFees only ever deducted the fee from
//     senders' custom WalletBalance ledger entries — it never minted any
//     real x/bank "mlcoin" coins to back it. DistributeFees then tried to
//     SEND coins the module never actually had, so distribution silently
//     failed (logged, swallowed) every single cycle since genesis — real
//     money vanishing from user balances that stakers/treasury never
//     received. query_treasury.go's GetTreasuryBalance already reads real
//     bank balance for this exact module+denom, confirming the intended
//     design was always "mint it for real", not "just track a number".
//
// Only bank+auth are unfaked here — mlcoin's own types.BankKeeper/AuthKeeper
// are concrete-type aliases (bankkeeper.BaseKeeper/authkeeper.AccountKeeper),
// not interfaces, so a lightweight hand-rolled mock (the pattern every other
// module in this repo uses) isn't possible — this is why the original test
// (TestDistributeFeesNoActiveStakers) was skipped rather than written.

func newRealBankTestKeeper(t *testing.T) (keeper.Keeper, bankkeeper.BaseKeeper, sdk.Context) {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(mlcoinmodule.AppModule{})
	std.RegisterInterfaces(encCfg.InterfaceRegistry)
	authtypes.RegisterInterfaces(encCfg.InterfaceRegistry)
	banktypes.RegisterInterfaces(encCfg.InterfaceRegistry)
	cdc := codec.NewProtoCodec(encCfg.InterfaceRegistry)

	keys := storetypes.NewKVStoreKeys(authtypes.StoreKey, banktypes.StoreKey, types.StoreKey)
	logger := log.NewNopLogger()
	cms := integration.CreateMultiStore(keys, logger)
	ctx := sdk.NewContext(cms, cmtproto.Header{}, false, logger)

	authKey, bankKey, mlcoinKey := keys[authtypes.StoreKey], keys[banktypes.StoreKey], keys[types.StoreKey]

	authorityAddr := authtypes.NewModuleAddress(types.GovModuleName)
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())

	// Matches app/app_config.go's real moduleAccPerms exactly — this is the
	// permission grant this whole test exists to prove is both necessary
	// and sufficient.
	maccPerms := map[string][]string{
		types.ModuleName: {authtypes.Minter, authtypes.Burner},
	}

	accountKeeper := authkeeper.NewAccountKeeper(
		cdc,
		runtime.NewKVStoreService(authKey),
		authtypes.ProtoBaseAccount,
		maccPerms,
		addressCodec,
		sdk.GetConfig().GetBech32AccountAddrPrefix(),
		authorityAddr.String(),
	)

	bankKeeper := bankkeeper.NewBaseKeeper(
		cdc,
		runtime.NewKVStoreService(bankKey),
		accountKeeper,
		map[string]bool{},
		authorityAddr.String(),
		log.NewNopLogger(),
	)
	require.NoError(t, bankKeeper.SetParams(ctx, banktypes.DefaultParams()))

	k := keeper.NewKeeper(
		runtime.NewKVStoreService(mlcoinKey),
		cdc,
		addressCodec,
		authorityAddr,
		accountKeeper,
		bankKeeper,
	)
	require.NoError(t, k.EmissionState.Set(ctx, types.EmissionState{TotalSupply: 670_000_000}))

	return k, bankKeeper, ctx
}

func TestDistributeFees_MintsRealCoinsAndPaysStakerAndTreasury(t *testing.T) {
	k, bankKeeper, ctx := newRealBankTestKeeper(t)

	staker := sdk.AccAddress([]byte("staker_address______")).String()
	require.NoError(t, k.StakingRecords.Set(ctx, staker, types.StakingInfo{
		Address:      staker,
		StakedAmount: 1000,
		IsActive:     true,
	}))

	require.NoError(t, k.AccumulateFees(ctx, "transfer", 100_00)) // 1% -> 100 accumulated

	require.NoError(t, k.DistributeFees(ctx))

	stakerAddr, err := sdk.AccAddressFromBech32(staker)
	require.NoError(t, err)
	stakerBalance := bankKeeper.GetBalance(ctx, stakerAddr, "mlcoin")
	require.True(t, stakerBalance.Amount.IsPositive(), "staker should have actually received real mlcoin coins, not just a bookkeeping entry")

	treasuryAddr := authtypes.NewModuleAddress("treasury")
	treasuryBalance := bankKeeper.GetBalance(ctx, treasuryAddr, "mlcoin")
	require.True(t, treasuryBalance.Amount.IsPositive(), "treasury should have actually received real mlcoin coins")

	// The full accumulated total (minus integer-division dust) must have
	// been minted and delivered — nothing silently destroyed.
	delivered := stakerBalance.Amount.Uint64() + treasuryBalance.Amount.Uint64()
	require.InDelta(t, uint64(100), delivered, 1)

	fees, err := k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Zero(t, fees.TransactionFees, "accumulator must reset only after a successful mint+distribute")
}

func TestDistributeFees_NoActiveStakers_TreasuryStillPaidForReal(t *testing.T) {
	k, bankKeeper, ctx := newRealBankTestKeeper(t)

	require.NoError(t, k.AccumulateFees(ctx, "transfer", 100_00))
	require.NoError(t, k.DistributeFees(ctx))

	treasuryAddr := authtypes.NewModuleAddress("treasury")
	treasuryBalance := bankKeeper.GetBalance(ctx, treasuryAddr, "mlcoin")
	require.True(t, treasuryBalance.Amount.IsPositive())

	// With no active stakers, the module account itself should be left
	// holding the un-delivered stakers' share rather than it vanishing —
	// confirms the mint covered the FULL total, not just the treasury half.
	moduleBalance := bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress(types.ModuleName), "mlcoin")
	require.True(t, moduleBalance.Amount.IsPositive())
}
