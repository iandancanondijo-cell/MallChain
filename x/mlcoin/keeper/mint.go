package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	"sync/atomic"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// MintToWallet mints Mallcoins to a user's wallet with integrated burning.
// The caller MUST ensure minting authorisation is established via WithMintingEnabled.
// Automatic burn: burn_rate_bps from emission state (e.g., 100 = 1% burn)
func (k *Keeper) MintToWallet(ctx context.Context, address string, amount uint64) error {
	// Re-entry guard prevents nested calls from bypassing WithMintingEnabled.
	if atomic.LoadInt32(&k.internalMinting) == 0 {
		return errorsmod.Wrap(types.ErrUnauthorized, "minting not enabled for this caller")
	}
	// Get emission state
	emissionState, err := k.EmissionState.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "emission state not initialized")
	}

	// Get daily limit from emission state
	dailyLimit := emissionState.DailyLimit

	// Overflow-safe supply check
	newCirculating, err := safeAdd(emissionState.Circulating, amount)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "circulating supply overflow")
	}
	if newCirculating > emissionState.TotalSupply {
		return errorsmod.Wrap(types.ErrSupplyExhausted, "cannot mint more than total supply")
	}

	// Check daily limit
	if amount > dailyLimit {
		return errorsmod.Wrap(types.ErrDailyLimitExceeded, "amount exceeds daily emission limit")
	}

	// Get or create wallet balance
	walletBalance, err := k.WalletBalance.Get(ctx, address)
	if err != nil {
		walletBalance = types.WalletBalance{
			Address: address,
			Balance: 0,
			Locked:  0,
		}
	}

	// Calculate burn amount (automatic burning based on burn_rate_bps)
	burnAmount := amount * emissionState.BurnRateBps / 10000
	netAmount := amount - burnAmount

	// Overflow-safe balance update (net amount after burn)
	newBalance, err := safeAdd(walletBalance.Balance, netAmount)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "wallet balance overflow on mint")
	}
	walletBalance.Balance = newBalance
	if err := k.WalletBalance.Set(ctx, address, walletBalance); err != nil {
		return err
	}

	// Update circulating supply (only net amount counts toward circulating)
	newCirc := newCirculating - burnAmount
	emissionState.Circulating = newCirc
	emissionState.EmittedTotal += amount
	emissionState.BurnedTotal += burnAmount
	if err := k.EmissionState.Set(ctx, emissionState); err != nil {
		return err
	}

	// Record mint transaction — surface errors for observability
	if _, err := k.RecordTransaction(ctx, "system", address, amount, "mint", "Minted from conversion or reward"); err != nil {
		sdkCtx := sdk.UnwrapSDKContext(ctx)
		sdkCtx.Logger().Info("mint recording failed (mint succeeded)", "address", address, "amount", amount, "error", err)
	}

	// Record burn transaction if any
	if burnAmount > 0 {
		if _, err := k.RecordTransaction(ctx, "system", "burn", burnAmount, "burn", "Auto-burn on mint"); err != nil {
			// Non-fatal log
		}
	}

	return nil
}
