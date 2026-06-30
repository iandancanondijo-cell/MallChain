package keeper

import (
	"context"
)

// HasUserBadge checks if a user has a badge (implements the interface expected by mallpoints)
func (k Keeper) HasUserBadge(ctx context.Context, address string) bool {
	_, err := k.UserBadge.Get(ctx, address)
	return err == nil
}
