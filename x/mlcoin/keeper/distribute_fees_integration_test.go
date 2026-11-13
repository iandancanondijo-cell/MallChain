package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
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

// Coverage for the fee-distribution path, which has been the source of two
// opposite live bugs and is therefore pinned from both sides here.
//
//  1. "mlcoin" had no entry in app_config.go's moduleAccPerms. Bank's
//     SendCoinsFromModuleToAccount PANICS (not just errors — see its own
//     doc comment) when the sender module isn't a registered account,
//     which crashed the whole node, not just this one EndBlocker call.
//  2. The first fix for the "stakers/treasury were never actually paid"
//     complaint was to MintCoins(totalFees) on every cycle. That was wrong
//     and audit finding H1 reverted it: fees accrue against this module's
//     custom WalletBalance ledger, which is not x/bank, and nothing ever
//     moves real mlcoin coins into the module account. Minting therefore
//     created uncapped net-new supply every cycle, and any user could
//     trigger it because MsgTransferMallcoin's fee floors to 1 base unit.
//
// DistributeFees now pays out only what the module actually holds in bank
// and leaves the undistributed remainder accrued, so the ledger stays
// truthful and a future migration to real coin collection can settle it.
// These tests hold both halves of that contract: no unbacked mint, and no
// silent destruction of the accrual either.
//
// Only bank+auth are unfaked here — mlcoin's own types.BankKeeper/AuthKeeper
// are concrete-type aliases (bankkeeper.BaseKeeper/authkeeper.AccountKeeper),
// not interfaces, so a lightweight hand-rolled mock (the pattern every other
// module in this repo uses) isn't possible.

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

// activeStaker registers one staker holding the whole of the stake, so a
// stakers' share of any size lands entirely on `addr`.
func activeStaker(t *testing.T, k keeper.Keeper, ctx sdk.Context, addr string) {
	t.Helper()
	require.NoError(t, k.StakingRecords.Set(ctx, addr, types.StakingInfo{
		Address:      addr,
		StakedAmount: 1000,
		IsActive:     true,
	}))
}

// TestDistributeFees_DoesNotMintUnbackedSupply is the H1 regression test.
// With fees accrued and an empty module account — the state every real block
// has been in since genesis — distribution must pay nobody and mint nothing.
// The pre-H1 behaviour was to mint the accrued number on the spot, which is
// how uncapped supply entered a chain whose users' balances live in a
// different ledger entirely.
func TestDistributeFees_DoesNotMintUnbackedSupply(t *testing.T) {
	k, bankKeeper, ctx := newRealBankTestKeeper(t)

	staker := sdk.AccAddress([]byte("staker_address______")).String()
	activeStaker(t, k, ctx, staker)

	require.NoError(t, k.AccumulateFees(ctx, "transfer", 100_00)) // 1% -> 100 accumulated

	require.NoError(t, k.DistributeFees(ctx))

	// The decisive assertion: minting totalFees would have put 100 mlcoin
	// into existence. Real supply must still be exactly zero.
	supply := bankKeeper.GetSupply(ctx, "mlcoin")
	require.True(t, supply.Amount.IsZero(), "fee distribution must not mint unbacked supply")

	stakerAddr, err := sdk.AccAddressFromBech32(staker)
	require.NoError(t, err)
	require.True(t, bankKeeper.GetBalance(ctx, stakerAddr, "mlcoin").Amount.IsZero())
	require.True(t, bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress("treasury"), "mlcoin").Amount.IsZero())

	// Nothing was paid, so nothing may be cleared: the accrual is the only
	// record that this money is owed. Clearing it was the other half of the
	// pre-H1 bug — fees deducted from users and never delivered.
	fees, err := k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(100), fees.TransactionFees, "unpaid fees must stay accrued")
}

// TestDistributeFees_PaysFromRealCoinsAndClearsOnlyWhatItPaid is the mirror
// case: once the module genuinely holds coins — the state after a future
// migration that collects MsgSend fees into the module account — the same
// call must move real money and reduce the accrual by exactly what left the
// module.
func TestDistributeFees_PaysFromRealCoinsAndClearsOnlyWhatItPaid(t *testing.T) {
	k, bankKeeper, ctx := newRealBankTestKeeper(t)

	staker := sdk.AccAddress([]byte("staker_address______")).String()
	activeStaker(t, k, ctx, staker)

	// Back the accrual with real coins, 10x the amount owed.
	require.NoError(t, bankKeeper.MintCoins(ctx, types.ModuleName,
		sdk.NewCoins(sdk.NewCoin("mlcoin", math.NewInt(1000)))))
	require.NoError(t, k.AccumulateFees(ctx, "transfer", 100_00))

	require.NoError(t, k.DistributeFees(ctx))

	stakerAddr, err := sdk.AccAddressFromBech32(staker)
	require.NoError(t, err)
	stakerBalance := bankKeeper.GetBalance(ctx, stakerAddr, "mlcoin")
	treasuryBalance := bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress("treasury"), "mlcoin")

	require.True(t, stakerBalance.Amount.IsPositive(), "staker must be paid in real coins")
	require.True(t, treasuryBalance.Amount.IsPositive(), "treasury must be paid in real coins")

	// 50/50 split of the 100 owed. Supply stays at the 1000 that was minted
	// into the module up front: moving coins between accounts creates
	// nothing, which is the whole point of H1.
	require.Equal(t, uint64(50), stakerBalance.Amount.Uint64())
	require.Equal(t, uint64(50), treasuryBalance.Amount.Uint64())
	require.Equal(t, uint64(1000), bankKeeper.GetSupply(ctx, "mlcoin").Amount.Uint64())
	require.Equal(t, uint64(900),
		bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress(types.ModuleName), "mlcoin").Amount.Uint64())

	fees, err := k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Zero(t, fees.TransactionFees, "accumulator clears once the amount is actually delivered")
}

// TestDistributeFees_PartialBackingLeavesRemainderAccrued covers the middle
// ground, which is the case a migration will sit in for weeks: the module
// holds less than the ledger says it owes. It may pay only what it holds and
// must keep the shortfall accrued rather than either inflating or writing it
// off. With no active stakers the stakers' half is undeliverable, so it too
// stays accrued instead of vanishing.
func TestDistributeFees_PartialBackingLeavesRemainderAccrued(t *testing.T) {
	k, bankKeeper, ctx := newRealBankTestKeeper(t)

	require.NoError(t, bankKeeper.MintCoins(ctx, types.ModuleName,
		sdk.NewCoins(sdk.NewCoin("mlcoin", math.NewInt(30)))))
	require.NoError(t, k.AccumulateFees(ctx, "transfer", 100_00))

	require.NoError(t, k.DistributeFees(ctx))

	treasuryBalance := bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress("treasury"), "mlcoin")
	require.Equal(t, uint64(15), treasuryBalance.Amount.Uint64(), "treasury gets half of what the module could pay")

	// Only the 15 that actually left the module may be cleared, so the
	// accrual drops 100 -> 85: 70 the module never held, plus the 15
	// staker-side coins it holds but had nobody to pay.
	fees, err := k.FeesAccumulated.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(85), fees.TransactionFees, "shortfall and undeliverable share both stay accrued")

	moduleBalance := bankKeeper.GetBalance(ctx, authtypes.NewModuleAddress(types.ModuleName), "mlcoin")
	require.Equal(t, uint64(15), moduleBalance.Amount.Uint64(),
		"undeliverable staker share stays in the module rather than being destroyed")
}
