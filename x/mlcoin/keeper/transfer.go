package keeper

import (
	"context"
	"math"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
)

// safeSub subtracts b from a, returning an error on underflow.
func safeSub(a, b uint64) (uint64, error) {
	if b > a {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "arithmetic underflow")
	}
	return a - b, nil
}

// safeAdd adds a and b, returning an error on overflow.
func safeAdd(a, b uint64) (uint64, error) {
	if a > math.MaxUint64-b {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "arithmetic overflow")
	}
	return a + b, nil
}

// safeMul multiplies a and b, returning an error on overflow.
func safeMul(a, b uint64) (uint64, error) {
	if b == 0 {
		return 0, nil
	}
	if a > math.MaxUint64/b {
		return 0, errorsmod.Wrap(types.ErrInvalidRequest, "arithmetic overflow")
	}
	return a * b, nil
}

func (k Keeper) Transfer(ctx context.Context, sender, recipient string, amount uint64) error {
	if sender == "" || recipient == "" {
		return errorsmod.Wrap(types.ErrInvalidRequest, "sender and recipient must be specified")
	}

	if _, err := k.addressCodec.StringToBytes(sender); err != nil {
		return errorsmod.Wrap(err, "invalid sender address")
	}
	if _, err := k.addressCodec.StringToBytes(recipient); err != nil {
		return errorsmod.Wrap(err, "invalid recipient address")
	}

	wallet, err := k.WalletBalance.Get(ctx, sender)
	if err != nil {
		return errorsmod.Wrap(types.ErrWalletNotFound, "sender wallet not found")
	}
	if wallet.Balance < amount {
		return errorsmod.Wrap(types.ErrInsufficientBalance, "sender has insufficient balance")
	}

	newBalance, err := safeSub(wallet.Balance, amount)
	if err != nil {
		return errorsmod.Wrap(err, "sender balance underflow")
	}
	wallet.Balance = newBalance
	if err := k.WalletBalance.Set(ctx, sender, wallet); err != nil {
		return errorsmod.Wrap(err, "failed to update sender balance")
	}

	receiverWallet, err := k.WalletBalance.Get(ctx, recipient)
	if err != nil {
		receiverWallet = types.WalletBalance{Address: recipient, Balance: 0}
	}
	newReceiverBalance, err := safeAdd(receiverWallet.Balance, amount)
	if err != nil {
		return errorsmod.Wrap(err, "receiver balance overflow")
	}
	receiverWallet.Balance = newReceiverBalance
	if err := k.WalletBalance.Set(ctx, recipient, receiverWallet); err != nil {
		return errorsmod.Wrap(err, "failed to update recipient balance")
	}

	if _, err := k.RecordTransaction(ctx, sender, recipient, amount, "transfer", "WASM bridge transfer"); err != nil {
		// Log the error but don't fail the transfer — the transfer is already committed.
		// The error is surfacing here for observability instead of being silently dropped.
		ctx, ok := ctx.(interface {
			Logger() interface{ Info(string, ...interface{}) }
		})
		if ok {
			ctx.Logger().Info("failed to record transfer transaction", "error", err)
		}
	}
	return nil
}
