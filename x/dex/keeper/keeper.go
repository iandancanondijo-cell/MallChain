package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/store"
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/dex/types"
)

type poolCodec struct{}

func (poolCodec) Encode(value types.Pool) ([]byte, error) {
	return json.Marshal(value)
}
func (poolCodec) Decode(b []byte) (types.Pool, error) {
	var v types.Pool
	err := json.Unmarshal(b, &v)
	return v, err
}
func (poolCodec) EncodeJSON(value types.Pool) ([]byte, error) {
	return json.Marshal(value)
}
func (poolCodec) DecodeJSON(b []byte) (types.Pool, error) {
	var v types.Pool
	err := json.Unmarshal(b, &v)
	return v, err
}
func (poolCodec) Stringify(value types.Pool) string {
	bz, _ := json.Marshal(value)
	return string(bz)
}
func (poolCodec) ValueType() string {
	return "dex/Pool"
}

type paramsCodec struct{}

func (paramsCodec) Encode(value types.Params) ([]byte, error) {
	return json.Marshal(value)
}
func (paramsCodec) Decode(b []byte) (types.Params, error) {
	var v types.Params
	err := json.Unmarshal(b, &v)
	return v, err
}
func (paramsCodec) EncodeJSON(value types.Params) ([]byte, error) {
	return json.Marshal(value)
}
func (paramsCodec) DecodeJSON(b []byte) (types.Params, error) {
	var v types.Params
	err := json.Unmarshal(b, &v)
	return v, err
}
func (paramsCodec) Stringify(value types.Params) string {
	bz, _ := json.Marshal(value)
	return string(bz)
}
func (paramsCodec) ValueType() string {
	return "dex/Params"
}

type Keeper struct {
	storeService store.KVStoreService
	bankKeeper   types.BankKeeper
	authority    string

	Schema        collections.Schema
	pools         collections.Map[uint64, types.Pool]
	poolLiquidity collections.Map[collections.Pair[uint64, []byte], sdk.Coin]
	params        collections.Item[types.Params]
	nextPoolId    collections.Item[uint64]
}

func NewKeeper(
	storeService store.KVStoreService,
	cdc codec.Codec,
	bankKeeper types.BankKeeper,
	authority string,
) (Keeper, error) {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		bankKeeper:   bankKeeper,
		authority:    authority,
		pools:        collections.NewMap(sb, types.PoolsKeyPrefix, "pools", collections.Uint64Key, poolCodec{}),
		poolLiquidity: collections.NewMap(sb, types.PoolLiquidityKeyPrefix, "pool_liquidity",
			collections.PairKeyCodec(collections.Uint64Key, collections.BytesKey),
			codec.CollValue[sdk.Coin](cdc)),
		params:     collections.NewItem(sb, types.ParamsKey, "params", paramsCodec{}),
		nextPoolId: collections.NewItem(sb, types.NextPoolIdKey, "next_pool_id", collections.Uint64Value),
	}

	schema, err := sb.Build()
	if err != nil {
		return Keeper{}, err
	}
	k.Schema = schema

	return k, nil
}

func (k Keeper) GetAuthority() string {
	return k.authority
}

func (k Keeper) SetParams(ctx context.Context, params types.Params) error {
	return k.params.Set(ctx, params)
}

func (k Keeper) GetParams(ctx context.Context) (types.Params, error) {
	return k.params.Get(ctx)
}

func (k Keeper) GetNextPoolId(ctx context.Context) (uint64, error) {
	id, err := k.nextPoolId.Get(ctx)
	if err != nil {
		return 1, nil
	}
	return id, nil
}

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

func (k Keeper) CreatePool(ctx context.Context, creator sdk.AccAddress, tokenA, tokenB sdk.Coin, fee string) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	if tokenA.Denom == tokenB.Denom {
		return 0, fmt.Errorf("token denominations must be different")
	}

	poolId, err := k.GetNextPoolId(ctx)
	if err != nil {
		return 0, err
	}

	params, err := k.GetParams(ctx)
	if err != nil {
		return 0, err
	}

	if fee == "" {
		fee = params.DefaultFee
	}

	if err := k.validateFee(fee, params); err != nil {
		return 0, err
	}

	minLiquidity := math.NewInt(int64(params.MinLiquidity))
	if tokenA.Amount.LT(minLiquidity) || tokenB.Amount.LT(minLiquidity) {
		return 0, fmt.Errorf("initial liquidity too low")
	}

	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, creator, types.ModuleName, sdk.NewCoins(tokenA, tokenB)); err != nil {
		return 0, err
	}

	liquidityAmount := integerSqrt(tokenA.Amount.Mul(tokenB.Amount))
	liquidityTokens := sdk.NewCoin(fmt.Sprintf("liquidity-%d", poolId), liquidityAmount)

	if err := k.bankKeeper.MintCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return 0, err
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, creator, sdk.NewCoins(liquidityTokens)); err != nil {
		return 0, err
	}

	pool := types.Pool{
		Id:            poolId,
		TokenADenom:   tokenA.Denom,
		TokenBDenom:   tokenB.Denom,
		TokenAReserve: &tokenA,
		TokenBReserve: &tokenB,
		TotalLiquidity: &liquidityTokens,
		Fee:           fee,
		Creator:       creator.String(),
	}

	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return 0, err
	}

	liquidityKey := collections.Join(poolId, creator.Bytes())
	if err := k.poolLiquidity.Set(ctx, liquidityKey, liquidityTokens); err != nil {
		return 0, err
	}

	if err := k.SetNextPoolId(ctx, poolId+1); err != nil {
		return 0, err
	}

	return poolId, nil
}

func (k Keeper) validateFee(fee string, params types.Params) error {
	minFee := math.LegacyMustNewDecFromStr(params.MinFee)
	maxFee := math.LegacyMustNewDecFromStr(params.MaxFee)

	feeDec, err := math.LegacyNewDecFromStr(fee)
	if err != nil {
		return fmt.Errorf("invalid fee format")
	}

	if feeDec.LT(minFee) || feeDec.GT(maxFee) {
		return fmt.Errorf("fee %s outside allowed range [%s, %s]", fee, params.MinFee, params.MaxFee)
	}

	return nil
}

func (k Keeper) AddLiquidity(ctx context.Context, provider sdk.AccAddress, poolId uint64, tokenAAmount, tokenBAmount sdk.Coin) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return fmt.Errorf("pool not found")
	}

	if tokenAAmount.Denom != pool.TokenADenom || tokenBAmount.Denom != pool.TokenBDenom {
		return fmt.Errorf("token denominations do not match pool")
	}

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

	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, provider, types.ModuleName, sdk.NewCoins(tokenAAmount, tokenBAmount)); err != nil {
		return err
	}

	if err := k.bankKeeper.MintCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return err
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, provider, sdk.NewCoins(liquidityTokens)); err != nil {
		return err
	}

	tokenAReserve := pool.TokenAReserve.Add(tokenAAmount)
	pool.TokenAReserve = &tokenAReserve
	tokenBReserve := pool.TokenBReserve.Add(tokenBAmount)
	pool.TokenBReserve = &tokenBReserve
	totalLiquidity := pool.TotalLiquidity.Add(liquidityTokens)
	pool.TotalLiquidity = &totalLiquidity

	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return err
	}

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

func (k Keeper) RemoveLiquidity(ctx context.Context, provider sdk.AccAddress, poolId uint64, liquidityTokens sdk.Coin) (sdk.Coin, sdk.Coin, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("pool not found")
	}

	liquidityKey := collections.Join(poolId, provider.Bytes())
	providerLiquidity, err := k.poolLiquidity.Get(ctx, liquidityKey)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("insufficient liquidity tokens")
	}

	if providerLiquidity.Amount.LT(liquidityTokens.Amount) {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("insufficient liquidity tokens")
	}

	tokenAAmount := liquidityTokens.Amount.Mul(pool.TokenAReserve.Amount).Quo(pool.TotalLiquidity.Amount)
	tokenBAmount := liquidityTokens.Amount.Mul(pool.TokenBReserve.Amount).Quo(pool.TotalLiquidity.Amount)

	tokenAOut := sdk.NewCoin(pool.TokenADenom, tokenAAmount)
	tokenBOut := sdk.NewCoin(pool.TokenBDenom, tokenBAmount)

	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, provider, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}
	if err := k.bankKeeper.BurnCoins(sdkCtx, types.ModuleName, sdk.NewCoins(liquidityTokens)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, provider, sdk.NewCoins(tokenAOut, tokenBOut)); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

	tokenAReserve := pool.TokenAReserve.Sub(tokenAOut)
	pool.TokenAReserve = &tokenAReserve
	tokenBReserve := pool.TokenBReserve.Sub(tokenBOut)
	pool.TokenBReserve = &tokenBReserve
	totalLiquidity := pool.TotalLiquidity.Sub(liquidityTokens)
	pool.TotalLiquidity = &totalLiquidity

	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return sdk.Coin{}, sdk.Coin{}, err
	}

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

func (k Keeper) Swap(ctx context.Context, sender sdk.AccAddress, poolId uint64, tokenIn sdk.Coin, tokenOutDenom string, minTokenOut sdk.Coin) (sdk.Coin, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, fmt.Errorf("pool not found")
	}

	params, err := k.GetParams(ctx)
	if err != nil {
		return sdk.Coin{}, fmt.Errorf("failed to get DEX parameters: %w", err)
	}

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

	if tokenOut.Amount.LT(minTokenOut.Amount) {
		return sdk.Coin{}, fmt.Errorf("insufficient output amount (slippage protection)")
	}

	maxDrainAmount := reserveOut.Amount.Mul(math.NewInt(int64(params.MaxPoolDrainPercent))).Quo(math.NewInt(100))
	if tokenOut.Amount.GT(maxDrainAmount) {
		return sdk.Coin{}, fmt.Errorf("swap blocked: would drain %.1f%% of pool reserves (max: %s, requested: %s)",
			float64(params.MaxPoolDrainPercent)/100.0,
			maxDrainAmount.String(),
			tokenOut.Amount.String())
	}

	if err := k.bankKeeper.SendCoinsFromAccountToModule(sdkCtx, sender, types.ModuleName, sdk.NewCoins(tokenIn)); err != nil {
		return sdk.Coin{}, err
	}

	if err := k.bankKeeper.SendCoinsFromModuleToAccount(sdkCtx, types.ModuleName, sender, sdk.NewCoins(tokenOut)); err != nil {
		return sdk.Coin{}, err
	}

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

	if err := k.pools.Set(ctx, poolId, pool); err != nil {
		return sdk.Coin{}, err
	}

	return tokenOut, nil
}

func parseFeeDec(fee string) math.LegacyDec {
	defaultFee := math.LegacyNewDecWithPrec(3, 3)
	if fee == "" {
		return defaultFee
	}

	parsed, err := math.LegacyNewDecFromStr(fee)
	if err != nil {
		return defaultFee
	}

	return parsed
}

func (k Keeper) calculateSwap(tokenIn, reserveIn, reserveOut sdk.Coin, fee string, maxPoolDrainPercent uint32) sdk.Coin {
	feeDec := parseFeeDec(fee)

	amountInDec := math.LegacyNewDecFromInt(tokenIn.Amount)
	reserveInDec := math.LegacyNewDecFromInt(reserveIn.Amount)
	reserveOutDec := math.LegacyNewDecFromInt(reserveOut.Amount)

	amountInAfterFee := amountInDec.Mul(math.LegacyNewDec(1).Sub(feeDec))

	numerator := amountInAfterFee.Mul(reserveOutDec)
	denominator := reserveInDec.Add(amountInAfterFee)
	amountOut := numerator.Quo(denominator)

	maxDrainDec := reserveOutDec.Mul(math.LegacyNewDec(int64(maxPoolDrainPercent)).Quo(math.LegacyNewDec(100)))
	if amountOut.GT(maxDrainDec) {
		amountOut = maxDrainDec
	}

	return sdk.NewCoin(reserveOut.Denom, amountOut.TruncateInt())
}

func (k Keeper) GetPool(ctx context.Context, poolId uint64) (types.Pool, error) {
	return k.pools.Get(ctx, poolId)
}

func (k Keeper) GetAllPools(ctx context.Context) ([]types.Pool, error) {
	var pools []types.Pool
	err := k.pools.Walk(ctx, nil, func(key uint64, value types.Pool) (bool, error) {
		pools = append(pools, value)
		return false, nil
	})
	return pools, err
}

func (k Keeper) GetPoolLiquidity(ctx context.Context, poolId uint64, address sdk.AccAddress) (sdk.Coin, error) {
	liquidityKey := collections.Join(poolId, address.Bytes())
	return k.poolLiquidity.Get(ctx, liquidityKey)
}

func (k Keeper) EstimateSwap(ctx context.Context, poolId uint64, tokenIn sdk.Coin, tokenOutDenom string) (sdk.Coin, sdk.Coin, error) {
	pool, err := k.pools.Get(ctx, poolId)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("pool not found")
	}

	params, err := k.GetParams(ctx)
	if err != nil {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("failed to get DEX parameters: %w", err)
	}

	var tokenOut sdk.Coin
	if tokenIn.Denom == pool.TokenADenom && tokenOutDenom == pool.TokenBDenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenAReserve, *pool.TokenBReserve, pool.Fee, params.MaxPoolDrainPercent)
	} else if tokenIn.Denom == pool.TokenBDenom && tokenOutDenom == pool.TokenADenom {
		tokenOut = k.calculateSwap(tokenIn, *pool.TokenBReserve, *pool.TokenAReserve, pool.Fee, params.MaxPoolDrainPercent)
	} else {
		return sdk.Coin{}, sdk.Coin{}, fmt.Errorf("invalid token pair for swap")
	}

	feeDec := parseFeeDec(pool.Fee)
	feeAmount := math.LegacyNewDecFromInt(tokenIn.Amount).Mul(feeDec).TruncateInt()
	fee := sdk.NewCoin(tokenIn.Denom, feeAmount)

	return tokenOut, fee, nil
}