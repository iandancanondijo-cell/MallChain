package keeper

import (
	"context"
)

// HasBadge checks if a user has a badge (delegates to badge keeper)
func (k Keeper) HasBadge(ctx context.Context, address string) bool {
	return k.badgeKeeper.HasUserBadge(ctx, address)
}

// MintToUser mints Mallcoins to a user's wallet (delegates to mlcoin keeper)
func (k Keeper) MintToUser(ctx context.Context, address string, amount uint64) error {
	return k.mlcoinKeeper.WithMintingEnabled(ctx, func() error {
		return k.mlcoinKeeper.MintToWallet(ctx, address, amount)
	})
}
