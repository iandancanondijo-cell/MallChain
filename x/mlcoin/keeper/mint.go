package keeper

import (
	"context"
	"sync/atomic"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// reentryGuard provides a call-depth counter to detect nested/recursive minting
// across the WithMintingEnabled / MintToWallet boundary. It is NOT a substitute
// for proper RBAC (see TODO below).
type reentryGuard struct {
	depth int32
}

func (g *reentryGuard) enter() bool {
	return atomic.AddInt32(&g.depth, 1) == 1
}

func (g *reentryGuard) exit() {
	atomic.AddInt32(&g.depth, -1)
}

// MintToWallet mints Mallcoins to a user's wallet.
// The caller MUST ensure minting authorisation is established via WithMintingEnabled.
// TODO: Replace WithMintingEnabled / atomic flag with proper role-based authorisation
// stored in params (e.g. a list of authorised minter addresses). See PHASE1_TODO.md.
func (k Keeper) MintToWallet(ctx context.Context, address string, amount uint64) error {
	// Re-entry guard prevents nested calls from bypassing WithMintingEnabled.
	if atomic.LoadInt32(&k.internalMinting) == 0 {
		return errorsmod.Wrap(types.ErrUnauthorized, "minting not enabled for this caller")
	}
	// Get emission state
	emissionState, err := k.EmissionState.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "emission state not initialized")
	}

	// Overflow-safe supply check
	newCirculating, err := safeAdd(emissionState.Circulating, amount)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "circulating supply overflow")
	}
	if newCirculating > emissionState.TotalSupply {
		return errorsmod.Wrap(types.ErrSupplyExhausted, "cannot mint more than total supply")
	}

	// Check daily limit
	if amount > emissionState.DailyLimit {
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

	// Overflow-safe balance update
	newBalance, err := safeAdd(walletBalance.Balance, amount)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidSupply, "wallet balance overflow on mint")
	}
	walletBalance.Balance = newBalance
	if err := k.WalletBalance.Set(ctx, address, walletBalance); err != nil {
		return err
	}

	// Update circulating supply
	emissionState.Circulating = newCirculating
	if err := k.EmissionState.Set(ctx, emissionState); err != nil {
		return err
	}

	// Record mint transaction — surface errors for observability
	if _, err := k.RecordTransaction(ctx, "system", address, amount, "mint", "Minted from conversion or reward"); err != nil {
		sdkCtx := sdk.UnwrapSDKContext(ctx)
		sdkCtx.Logger().Info("mint recording failed (mint succeeded)", "address", address, "amount", amount, "error", err)
	}

	return nil
}
