package keeper

import (
	"context"
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/mlcoin/types"
)

// GetAccount returns a lightweight Account view derived from the Auth module.
func (k Keeper) GetAccount(ctx context.Context, addr string) (types.Account, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	accAddr, err := sdk.AccAddressFromBech32(addr)
	if err != nil {
		return types.Account{}, err
	}
	acct := k.authKeeper.GetAccount(sdkCtx, accAddr)
	if acct == nil {
		return types.Account{}, fmt.Errorf("account not found")
	}
	pub := ""
	if acct.GetPubKey() != nil {
		pub = acct.GetPubKey().String()
	}
	return types.Account{Address: addr, PublicKey: pub, Nonce: acct.GetSequence()}, nil
}

// SetAccount is not supported; account management is handled by the Auth module.
func (k Keeper) SetAccount(ctx context.Context, addr string, acc types.Account) error {
	return fmt.Errorf("SetAccount is not supported; use the auth module")
}

// HasAccount returns true if the account exists in the auth keeper.
func (k Keeper) HasAccount(ctx context.Context, addr string) bool {
	_, err := k.GetAccount(ctx, addr)
	return err == nil
}

// BindPublicKeyIfMissing is a no-op; public keys are managed by the auth/tx flow.
func (k Keeper) BindPublicKeyIfMissing(ctx context.Context, addr string, pubkey string) (bool, error) {
	return false, fmt.Errorf("BindPublicKeyIfMissing is not supported; use standard signing flow")
}

// GetNonce returns the account sequence from the auth keeper.
func (k Keeper) GetNonce(ctx context.Context, addr string) (uint64, error) {
	a, err := k.GetAccount(ctx, addr)
	if err != nil {
		return 0, nil
	}
	return a.Nonce, nil
}

// IncrementNonce is not supported; sequence numbers are managed by the auth ante handler.
func (k Keeper) IncrementNonce(ctx context.Context, addr string) error {
	return fmt.Errorf("IncrementNonce is not supported; sequence managed by auth module")
}
