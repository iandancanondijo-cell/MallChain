package keeper

import (
	"context"

	"crypto/sha256"
	"crypto/subtle"
	"encoding/binary"
	"math/bits"

	"marketplace/x/mallpoints/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) AwardPoints(ctx context.Context, msg *types.MsgAwardPoints) (*types.MsgAwardPointsResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	if _, err := k.addressCodec.StringToBytes(msg.Recipient); err != nil {
		return nil, errorsmod.Wrap(err, "invalid recipient address")
	}

	// Get or create user points record
	userPoints, err := k.Keeper.UserPoints.Get(ctx, msg.Recipient)
	if err != nil {
		userPoints = types.UserPoints{
			Address:        msg.Recipient,
			Points:         0,
			TasksCompleted: 0,
			LastEarned:     0,
		}
	}

	if msg.Amount == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidRequest, "award amount must be > 0")
	}

	// Enforce monthly Mallpoints issuance cap
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentMonthKey := sdkCtx.BlockTime().UTC().Format("2006-01")
	monthlyIssued, err := k.Keeper.MonthlyPointsIssued.Get(ctx, currentMonthKey)
	if err != nil {
		monthlyIssued = 0
	}
	if monthlyIssued+msg.Amount > types.MonthlyPointsCap {
		return nil, errorsmod.Wrap(types.ErrMonthlyCapExceeded, "monthly Mallpoints issuance cap exceeded")
	}

	// Award points based on task type
	// For engagement tasks require a proof-of-work OR a badge
	if msg.TaskType == "engagement" {
		powValid := false

		// Verify PoW if provided: hash := sha256(nonce || creator || recipient || task_type || amount)
		if len(msg.Pow) > 0 {
			h := sha256.New()
			// write nonce as big-endian uint64
			var nb [8]byte
			binary.BigEndian.PutUint64(nb[:], msg.Nonce)
			h.Write(nb[:])
			h.Write([]byte(msg.Creator))
			h.Write([]byte(msg.Recipient))
			h.Write([]byte(msg.TaskType))
			// write amount as big-endian uint64
			var ab [8]byte
			binary.BigEndian.PutUint64(ab[:], msg.Amount)
			h.Write(ab[:])
			digest := h.Sum(nil)

			// difficulty: number of leading zero bits required. Default to 16 bits.
			requiredLeadingZeroBits := 16

			// Also accept if client provided pow equals computed digest and leading bits sufficient
			if bitsLeading(digest) >= requiredLeadingZeroBits && len(msg.Pow) == len(digest) {
				// prefer verifying the provided pow matches the computed digest
				if sha256Equal(digest, msg.Pow) {
					powValid = true
				}
			}
		}

		if !powValid {
			// fallback to badge requirement
			if !k.badgeKeeper.HasUserBadge(ctx, msg.Creator) {
				return nil, errorsmod.Wrap(types.ErrNoBadge, "creator missing required badge or valid PoW for engagement tasks")
			}
		}
	}

	userPoints.Points += msg.Amount
	userPoints.TasksCompleted += 1
	// Set LastEarned to current block time (seconds since epoch)
	sdkCtx = sdk.UnwrapSDKContext(ctx)
	userPoints.LastEarned = uint64(sdkCtx.BlockTime().Unix())

	if err := k.Keeper.UserPoints.Set(ctx, msg.Recipient, userPoints); err != nil {
		return nil, err
	}

	monthlyIssued += msg.Amount
	if err := k.Keeper.MonthlyPointsIssued.Set(ctx, currentMonthKey, monthlyIssued); err != nil {
		return nil, err
	}

	return &types.MsgAwardPointsResponse{}, nil
}

// bitsLeading returns the number of leading zero bits in b.
func bitsLeading(b []byte) int {
	total := 0
	for _, by := range b {
		if by == 0 {
			total += 8
			continue
		}
		total += bits.LeadingZeros8(by)
		break
	}
	return total
}

// sha256Equal compares two digests in constant time.
func sha256Equal(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare(a, b) == 1
}
