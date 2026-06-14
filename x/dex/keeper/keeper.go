package keeper

import (
	"context"
	"fmt"
	"math/big"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/store"
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/dex/types"
)

// Keeper defines the dex module keeper
type Keeper struct {
	storeService store.KVStoreService
	bankKeeper   types.BankKeeper
	authority    string

	// Collections
	pools         collections.Map[uint64, types.Pool]
	poolLiquidity collections.Map[collections.Pair[uint64, []byte], sdk.Coin]
	params        collections.Item[types.Params]
	nextPoolId    collections.Item[uint64]
}

// NewKeeper creates a new dex keeper
func NewKeeper(
	storeService store.KVStoreService,
	cdc codec.Codec,
	bankKeeper types.BankKeeper,
	authority string,
) Keeper {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		bankKeeper:   bankKeeper,
		authority:    authority,
		pools:        collections.NewMap(sb, types.PoolsKeyPrefix, "pools", collections.Uint64Key, codec.CollValue[types.Pool](cdc)),
		poolLiquidity: collections.NewMap(sb, types.PoolLiquidityKeyPrefix, "pool_liquidity",
			collections.PairKeyCodec(collections.Uint64Key, collections.BytesKey),
			codec.CollValue[sdk.Coin](cdc)),
		params:     collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		nextPoolId: collections.NewItem(sb, types.NextPoolIdKey, "next_pool_id", collections.Uint64Value),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	_ = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() string {
	return k.authority
}

// SetParams sets the module parameters.
func (k Keeper) SetParams(ctx context.Context, params types.Params) error {
	return k.params.Set(ctx, params)
}

// GetParams returns the module parameters.
func (k Keeper) GetParams(ctx context.Context) (types.Params, error) {
	return k.params.Get(ctx)
}

// GetNextPoolId returns the next available pool ID.
func (k Keeper) GetNextPoolId(ctx context.Context) (uint64, error) {
	id, err := k.nextPoolId.Get(ctx)
	if err != nil {
		return 1, nil // Start with ID 1 if not set
	}
	return id, nil
}

// SetNextPoolId sets the next available pool ID.
func (k Keeper) SetNextPoolId(ctx context.Context, id uint64) error {
	return k.nextPoolId.Set(ctx, id)
}

func integerSqrt(value math.Int) math.Int {
	if value.IsNegative() {
		return math.ZeroInt()
	}

	sqrt := new(big.Int).Sqrt(value.BigInt())
	return math.NewIntFromBigInt(sqrt)
}

// CreatePool creates a new liquidity pool.
func (k Keeper) CreatePool(ctx context.Context, creator sdk.AccAddress, tokenA, tokenB sdk.Coin, fee string) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Validate tokens
	if tokenA.Denom == tokenB.Denom {
		return 0, fmt.Errorf("token denominations must be different")
	}

	// Get next pool ID
	poolId, err := k.GetNextPoolId(ctx)
	if err != nil {
		return 0, err
	}

	// Get params for validation
	params, err := k.GetParams(ctx)
	if err != nil {
		return 0, err
	}

	// Validate fee
	if fee == "" {
		fee = params.DefaultFee
	}

	// Check minimum liquidity
	minLiquidity := math.NewInt(int64(params.MinLiquidity))
	if tokenA.Amount.LT(minLiquidity) || tokenB.Amount.LT(minLiquidity) {
		return 0, fmt.Errorf("initial liquidity too low")
	}

	// Transfer tokens from creator to module
	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, creator, types.ModuleName, sdk.NewCoins(tokenA, tokenB)); err != nil {
		return 0, err
	}

	// Calculate initial liquidity tokens (sqrt(tokenA * tokenB))
	liquidityAmount := integerSqrt(tokenA.Amount.Mul(tokenB.Amount))
	liquidityTokens := sdk.NewCoin(fmt.Sprintf("liquidity-%d", poolId), liquidityAmount)

	// Mint liquidity tokens to creator
	if err := k.bankKeeper.MintCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return 0, err
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, creator, sdk.NewCoins(liquidityTokens)); err != nil {
		return 0, err
	}

	// Create pool
	pool := types.Pool{
		Id:             poolId,
		TokenADenom:    tokenA.Denom,
		TokenBDenom:    tokenB.Denom,
		TokenAReserve:  &tokenA,
		TokenBReserve:  &tokenB,
		TotalLiquidity: &liquidityTokens,
		Fee:            fee,
		Creator:        creator.String(),
	}

	// Store pool
	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return 0, err
	}

	// Store initial liquidity for creator
	liquidityKey := collections.Join(poolId, creator.Bytes())
	if err := k.poolLiquidity.Set(ctx, liquidityKey, liquidityTokens); err != nil {
		return 0, err
	}

	// Update next pool ID
	if err := k.SetNextPoolId(ctx, poolId+1); err != nil {
		return 0, err
	}

	return poolId, nil
}

// AddLiquidity adds liquidity to an existing pool.
func (k Keeper) AddLiquidity(ctx context.Context, provider sdk.AccAddress, poolId uint64, tokenAAmount, tokenBAmount sdk.Coin) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get pool
	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return fmt.Errorf("pool not found")
	}

	// Validate token amounts match pool tokens
	if tokenAAmount.Denom != pool.TokenADenom || tokenBAmount.Denom != pool.TokenBDenom {
		return fmt.Errorf("token denominations do not match pool")
	}

	// Calculate liquidity tokens to mint
	// liquidity = min(tokenA / reserveA, tokenB / reserveB) * total_liquidity
	liquidityA := tokenAAmount.Amount.Mul(pool.TotalLiquidity.Amount).Quo(pool.TokenAReserve.Amount)
	liquidityB := tokenBAmount.Amount.Mul(pool.TotalLiquidity.Amount).Quo(pool.TokenBReserve.Amount)
	var liquidityToMint math.Int
	if liquidityA.LT(liquidityB) {
		liquidityToMint = liquidityA
	} else {
		liquidityToMint = liquidityB
	}

	if liquidityToMint.IsZero() {
		return fmt.Errorf("insufficient liquidity provided")
	}

	liquidityTokens := sdk.NewCoin(pool.TotalLiquidity.Denom, liquidityToMint)

	// Transfer tokens from provider to module
	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, provider, types.ModuleName, sdk.NewCoins(tokenAAmount, tokenBAmount)); err != nil {
		return err
	}

	// Mint liquidity tokens to provider
	if err := k.bankKeeper.MintCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return err
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, provider, sdk.NewCoins(liquidityTokens)); err != nil {
		return err
	}

	// Update pool reserves
	tokenAReserve := pool.TokenAReserve.Add(tokenAAmount)
	pool.TokenAReserve = &tokenAReserve
	tokenBReserve := pool.TokenBReserve.Add(tokenBAmount)
	pool.TokenBReserve = &tokenBReserve
	totalLiquidity := pool.TotalLiquidity.Add(liquidityTokens)
	pool.TotalLiquidity = &totalLiquidity

	// Store updated pool
	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return err
	}

	// Update provider's liquidity
	liquidityKey := collections.Join(poolId, provider.Bytes())
	existingLiquidity, err := k.poolLiquidity.Get(ctx, liquidityKey)
	if err != nil {
		existingLiquidity = sdk.NewCoin(liquidityTokens.Denom, math.ZeroInt())
	}
	newLiquidity := existingLiquidity.Add(liquidityTokens)
	if err := k.poolLiquidity.Set(ctx, liquidityKey, newLiquidity); err != nil {
		return err
	}

	return nil
}

// RemoveLiquidity removes liquidity from a pool.
func (k Keeper) RemoveLiquidity(ctx context.Context, provider sdk.AccAddress, poolId uint64, liquidityTokens sdk.Coin) (sdk.Coin, sdk.Coin, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get pool
	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("pool not found")
	}

	// Get provider's liquidity
	liquidityKey := collections.Join(poolId, provider.Bytes())
	providerLiquidity, err := k.poolLiquidity.Get(ctx, liquidityKey)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("insufficient liquidity tokens")
	}

	if providerLiquidity.Amount.LT(liquidityTokens.Amount) {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("insufficient liquidity tokens")
	}

	// Calculate token amounts to return
	tokenAAmount := liquidityTokens.Amount.Mul(pool.TokenAReserve.Amount).Quo(pool.TotalLiquidity.Amount)
	tokenBAmount := liquidityTokens.Amount.Mul(pool.TokenBReserve.Amount).Quo(pool.TotalLiquidity.Amount)

	tokenAOut := sdk.NewCoin(pool.TokenADenom, tokenAAmount)
	tokenBOut := sdk.NewCoin(pool.TokenBDenom, tokenBAmount)

	// Burn liquidity tokens
	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, provider, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}
	if err := k.bankKeeper.BurnCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

	// Send tokens back to provider
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, provider, sdk.NewCoins(tokenAOut, tokenBOut)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

	// Update pool reserves
	tokenAReserve := pool.TokenAReserve.Sub(tokenAOut)
	pool.TokenAReserve = &tokenAReserve
	tokenBReserve := pool.TokenBReserve.Sub(tokenBOut)
	pool.TokenBReserve = &tokenBReserve
	totalLiquidity := pool.TotalLiquidity.Sub(liquidityTokens)
	pool.TotalLiquidity = &totalLiquidity

	// Store updated pool
	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

	// Update provider's liquidity
	newLiquidity := providerLiquidity.Sub(liquidityTokens)
	if newLiquidity.IsZero() {
		if err := k.poolLiquidity.Remove(ctx, liquidityKey); err != nil {
			return sdk.Coin{}, sdk.Coin{}, err
		}
	} else {
		if err := k.poolLiquidity.Set(ctx, liquidityKey, newLiquidity); err != nil {
			return sdk.Coin{}, sdk.Coin{}, err
		}
	}

	return tokenAOut, tokenBOut, nil
}

// Swap performs a token swap.
func (k Keeper) Swap(ctx context.Context, sender sdk.AccAddress, poolId uint64, tokenIn sdk.Coin, tokenOutDenom string, minTokenOut sdk.Coin) (sdk.Coin, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Get pool
	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, fmt.Errorf("pool not found")
	}

	// Get params for pool drain protection
	params, err := k.GetParams(ctx)
	if err != nil {
		return sdk.Coin{}, fmt.Errorf("failed to get DEX parameters: %w", err)
	}

	// Validate swap
	var tokenOut sdk.Coin
	var reserveOut sdk.Coin
	if tokenIn.Denom == pool.TokenADenom && tokenOutDenom == pool.TokenBDenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenAReserve, *pool.TokenBReserve, pool.Fee, params.MaxPoolDrainPercent)
		reserveOut = *pool.TokenBReserve
	} else if tokenIn.Denom == pool.TokenBDenom && tokenOutDenom == pool.TokenADenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenBReserve, *pool.TokenAReserve, pool.Fee, params.MaxPoolDrainPercent)
		reserveOut = *pool.TokenAReserve
	} else {
		return sdk.Coin{}, fmt.Errorf("invalid token pair for swap")
	}

	// Check minimum output
	if tokenOut.Amount.LT(minTokenOut.Amount) {
		return sdk.Coin{}, fmt.Errorf("insufficient output amount")
	}

	// Check pool drain protection (use safe math to prevent overflow)
	maxDrainAmount := reserveOut.Amount.Mul(math.NewInt(int64(params.MaxPoolDrainPercent))).Quo(math.NewInt(100))
	if tokenOut.Amount.GT(maxDrainAmount) {
		return sdk.Coin{}, fmt.Errorf("swap would drain more than maximum allowed %.1f%% of pool reserves (max: %s, requested: %s)",
			float64(params.MaxPoolDrainPercent)/100.0,
			maxDrainAmount.String(),
			tokenOut.Amount.String())
	}

	// Transfer token in from sender to module
	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, sender, types.ModuleName, sdk.NewCoins(tokenIn)); err != nil {
		return sdk.Coin{}, err
	}

	// Send token out from module to sender
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, sender, sdk.NewCoins(tokenOut)); err != nil {
		return sdk.Coin{}, err
	}

	// Update pool reserves
	if tokenIn.Denom == pool.TokenADenom {
		tokenAReserve := pool.TokenAReserve.Add(tokenIn)
		pool.TokenAReserve = &tokenAReserve
		tokenBReserve := pool.TokenBReserve.Sub(tokenOut)
		pool.TokenBReserve = &tokenBReserve
	} else {
		tokenBReserve := pool.TokenBReserve.Add(tokenIn)
		pool.TokenBReserve = &tokenBReserve
		tokenAReserve := pool.TokenAReserve.Sub(tokenOut)
		pool.TokenAReserve = &tokenAReserve
	}

	// Store updated pool
	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return sdk.Coin{}, err
	}

	return tokenOut, nil
}

// parseFeeDec returns a LegacyDec fee with a safe default of 0.3%.
func parseFeeDec(fee string) math.LegacyDec {
	defaultFee := math.LegacyNewDecWithPrec(3, 3) // 0.003
	if fee == "" {
		return defaultFee
	}

	parsed, err := math.LegacyNewDecFromStr(fee)
	if err != nil {
		return defaultFee
	}

	return parsed
}

// calculateSwap calculates the output amount for a swap using AMM formula
func (k Keeper) calculateSwap(tokenIn, reserveIn, reserveOut sdk.Coin, fee string, maxPoolDrainPercent uint32) sdk.Coin {
	feeDec := parseFeeDec(fee)

	// Convert amounts to LegacyDec for calculations
	amountInDec := math.LegacyNewDecFromInt(tokenIn.Amount)
	reserveInDec := math.LegacyNewDecFromInt(reserveIn.Amount)
	reserveOutDec := math.LegacyNewDecFromInt(reserveOut.Amount)

	// Apply fee: amountIn * (1 - fee)
	amountInAfterFee := amountInDec.Mul(math.LegacyNewDec(1).Sub(feeDec))

	// AMM formula: amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
	numerator := amountInAfterFee.Mul(reserveOutDec)
	denominator := reserveInDec.Add(amountInAfterFee)
	amountOut := numerator.Quo(denominator)

	// Apply pool drain protection: cap amountOut to maxPoolDrainPercent of reserveOut
	maxDrainDec := reserveOutDec.Mul(math.LegacyNewDec(int64(maxPoolDrainPercent)).Quo(math.LegacyNewDec(100)))
	if amountOut.GT(maxDrainDec) {
		amountOut = maxDrainDec
	}

	return sdk.NewCoin(reserveOut.Denom, amountOut.TruncateInt())
}

// GetPool returns a specific pool.
func (k Keeper) GetPool(ctx context.Context, poolId uint64) (types.Pool, error) {
	return k.pools.Get(ctx, poolId)
}

// GetAllPools returns all pools.
func (k Keeper) GetAllPools(ctx context.Context) ([]types.Pool, error) {
	var pools []types.Pool
	err := k.pools.Walk(ctx, nil, func(key uint64, value types.Pool) (bool, error) {
		pools = append(pools, value)
		return false, nil
	})
	return pools, err
}

// GetPoolLiquidity returns the liquidity for a specific address in a pool.
func (k Keeper) GetPoolLiquidity(ctx context.Context, poolId uint64, address sdk.AccAddress) (sdk.Coin, error) {
	liquidityKey := collections.Join(poolId, address.Bytes())
	return k.poolLiquidity.Get(ctx, liquidityKey)
}

// EstimateSwap estimates the result of a token swap without executing it.
func (k Keeper) EstimateSwap(ctx context.Context, poolId uint64, tokenIn sdk.Coin, tokenOutDenom string) (sdk.Coin, sdk.Coin, error) {
	// Get pool
	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("pool not found")
	}

	// Get params for pool drain protection
	params, err := k.GetParams(ctx)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("failed to get DEX parameters: %w", err)
	}

	// Calculate swap with pool drain protection
	var tokenOut sdk.Coin
	if tokenIn.Denom == pool.TokenADenom && tokenOutDenom == pool.TokenBDenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenAReserve, *pool.TokenBReserve, pool.Fee, params.MaxPoolDrainPercent)
	} else if tokenIn.Denom == pool.TokenBDenom && tokenOutDenom == pool.TokenADenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenBReserve, *pool.TokenAReserve, pool.Fee, params.MaxPoolDrainPercent)
	} else {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("invalid token pair for swap")
	}

	// Calculate fee
	feeDec := parseFeeDec(pool.Fee)
	feeAmount := math.LegacyNewDecFromInt(tokenIn.Amount).Mul(feeDec).TruncateInt()
	fee := sdk.NewCoin(tokenIn.Denom, feeAmount)

	return tokenOut, fee, nil
}
