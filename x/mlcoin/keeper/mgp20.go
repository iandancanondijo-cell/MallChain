package keeper

import (
	"context"
	"errors"

	"marketplace/x/mlcoin/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
)

func allowanceKey(owner, spender string) string {
	return owner + "|" + spender
}

// GetAllowance returns the current approved allowance from owner to spender.
func (k Keeper) GetAllowance(ctx context.Context, owner, spender string) (uint64, error) {
	allowance, err := k.Allowances.Get(ctx, allowanceKey(owner, spender))
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return 0, nil
		}
		return 0, errorsmod.Wrap(err, "failed to read allowance")
	}

	return allowance, nil
}

// SetAllowance updates the approved allowance from owner to spender.
func (k Keeper) SetAllowance(ctx context.Context, owner, spender string, amount uint64) error {
	return k.Allowances.Set(ctx, allowanceKey(owner, spender), amount)
}

// Approve grants spender permission to transfer up to amount from owner's balance.
func (k Keeper) Approve(ctx context.Context, owner, spender string, amount uint64) error {
	if owner == "" || spender == "" {
		return errorsmod.Wrap(types.ErrInvalidRequest, "owner and spender must be specified")
	}

	if _, err := k.addressCodec.StringToBytes(owner); err != nil {
		return errorsmod.Wrap(err, "invalid owner address")
	}
	if _, err := k.addressCodec.StringToBytes(spender); err != nil {
		return errorsmod.Wrap(err, "invalid spender address")
	}

	return k.SetAllowance(ctx, owner, spender, amount)
}

// TransferFrom moves amount from owner to recipient using spender's allowance.
func (k Keeper) TransferFrom(ctx context.Context, owner, spender, recipient string, amount uint64) error {
	if amount == 0 {
		return errorsmod.Wrap(types.ErrInvalidRequest, "transfer amount must be greater than zero")
	}

	if _, err := k.addressCodec.StringToBytes(owner); err != nil {
		return errorsmod.Wrap(err, "invalid owner address")
	}
	if _, err := k.addressCodec.StringToBytes(spender); err != nil {
		return errorsmod.Wrap(err, "invalid spender address")
	}
	if _, err := k.addressCodec.StringToBytes(recipient); err != nil {
		return errorsmod.Wrap(err, "invalid recipient address")
	}

	allowance, err := k.GetAllowance(ctx, owner, spender)
	if err != nil {
		return err
	}
	if allowance < amount {
		return errorsmod.Wrap(types.ErrInsufficientAllowance, "allowance too low")
	}

	ownerWallet, err := k.WalletBalance.Get(ctx, owner)
	if err != nil {
		return errorsmod.Wrap(types.ErrWalletNotFound, "owner wallet not found")
	}
	if ownerWallet.Balance < amount {
		return errorsmod.Wrap(types.ErrInsufficientBalance, "owner has insufficient balance")
	}

	recipientWallet, err := k.WalletBalance.Get(ctx, recipient)
	if err != nil {
		recipientWallet = types.WalletBalance{Address: recipient, Balance: 0}
	}

	ownerWallet.Balance -= amount
	recipientWallet.Balance += amount

	if err := k.WalletBalance.Set(ctx, owner, ownerWallet); err != nil {
		return errorsmod.Wrap(err, "failed to update owner balance")
	}
	if err := k.WalletBalance.Set(ctx, recipient, recipientWallet); err != nil {
		return errorsmod.Wrap(err, "failed to update recipient balance")
	}

	if err := k.SetAllowance(ctx, owner, spender, allowance-amount); err != nil {
		return errorsmod.Wrap(err, "failed to update allowance")
	}

	_, _ = k.RecordTransaction(ctx, owner, recipient, amount, "transfer_from", "Allowed transfer")

	return nil
}
