package keeper

import (
	"context"
)

// HasUserBadge checks if a user has a badge
func (k Keeper) HasUserBadge(ctx context.Context, address string) bool {
	badge, err := k.UserBadge.Get(ctx, address)
	if err != nil {
		return false
	}
	return badge.HasBadge
}
