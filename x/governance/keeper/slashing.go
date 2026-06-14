package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// SlashValidatorProposal handles validator slashing triggered by governance proposals.
// This integrates with the staking keeper to actually reduce validator stakes.
func (k Keeper) SlashValidatorProposal(ctx context.Context, validatorAddr string, slashPercentage uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if k.stakingKeeper == nil {
		return fmt.Errorf("staking keeper not available for validator slashing")
	}

	if slashPercentage > 100 {
		return fmt.Errorf("slash percentage cannot exceed 100")
	}

	// Convert validator address string to sdk.ValAddress
	valAddr, err := sdk.ValAddressFromBech32(validatorAddr)
	if err != nil {
		return fmt.Errorf("invalid validator address: %w", err)
	}

	// Get the validator
	validator, err := k.stakingKeeper.GetValidator(sdkCtx, valAddr)
	if err != nil {
		return fmt.Errorf("validator not found: %w", err)
	}

	// Calculate slash amount: validator_tokens * (slashPercentage / 100)
	slashPercentageDec := math.LegacyNewDec(int64(slashPercentage)).Quo(math.LegacyNewDec(100))
	slashAmount := math.LegacyNewDecFromInt(validator.Tokens).Mul(slashPercentageDec).TruncateInt()

	if slashAmount.IsPositive() {
		// Calculate slash fraction (slashPercentage / 100)
		slashFraction := math.LegacyNewDecFromInt(math.NewInt(int64(slashPercentage))).Quo(math.LegacyNewDecFromInt(math.NewInt(100)))

		// Get current block height for the slash infraction
		infractionHeight := sdkCtx.BlockHeight()

		// Convert ValAddress to ConsAddress (both are []byte, so direct conversion)
		consAddr := sdk.ConsAddress(valAddr)

		// Perform the actual slash through staking keeper
		// Parameters: ctx, consAddr, infractionHeight, power, slashFraction
		_, err := k.stakingKeeper.Slash(sdkCtx, consAddr, infractionHeight, validator.Tokens.Int64(), slashFraction)
		if err != nil {
			return fmt.Errorf("failed to slash validator: %w", err)
		}

		// Log the slashing event
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"validator_slashed",
				sdk.NewAttribute("validator", validatorAddr),
				sdk.NewAttribute("slash_percentage", fmt.Sprintf("%d", slashPercentage)),
				sdk.NewAttribute("slash_amount", slashAmount.String()),
				sdk.NewAttribute("slash_fraction", slashFraction.String()),
				sdk.NewAttribute("infraction_height", fmt.Sprintf("%d", infractionHeight)),
			),
		)
	}

	return nil
}
