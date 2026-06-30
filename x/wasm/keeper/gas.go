package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/wasm/types"
)

func (k Keeper) GetGasConfig(_ context.Context) (types.GasConfig, error) {
	return types.DefaultGasConfig(), nil
}

func (k Keeper) consumeSDKGas(sdkCtx sdk.Context, gasUsed uint64, descriptor string) error {
	if gasUsed == 0 {
		return nil
	}
	remaining := sdkCtx.GasMeter().Limit() - sdkCtx.GasMeter().GasConsumedToLimit()
	if gasUsed > remaining {
		return types.ErrContractFailed.Wrap("out of gas")
	}
	sdkCtx.GasMeter().ConsumeGas(gasUsed, descriptor)
	return nil
}
