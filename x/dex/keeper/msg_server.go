package keeper

import (
	"context"
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/dex/types"
)

type msgServer struct {
	types.UnimplementedMsgServer
	k Keeper
}

func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{k: keeper}
}

var _ types.MsgServer = &msgServer{}

// CreatePool implements types.MsgServer
func (m msgServer) CreatePool(ctx context.Context, msg *types.MsgCreatePool) (*types.MsgCreatePoolResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	creator, err := sdk.AccAddressFromBech32(msg.Creator)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	if msg.TokenA == nil || msg.TokenB == nil {
		return nil, fmt.Errorf("token_a and token_b cannot be nil")
	}
	poolId, err := m.k.CreatePool(ctx, creator, *msg.TokenA, *msg.TokenB, msg.Fee)
	if err != nil {
		return nil, err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			types.EventTypeCreatePool,
			sdk.NewAttribute(types.AttributeKeyPoolId, fmt.Sprintf("%d", poolId)),
			sdk.NewAttribute(types.AttributeKeyCreator, msg.Creator),
			sdk.NewAttribute(types.AttributeKeyTokenA, msg.TokenA.String()),
			sdk.NewAttribute(types.AttributeKeyTokenB, msg.TokenB.String()),
		),
	})

	return &types.MsgCreatePoolResponse{PoolId: poolId}, nil
}

// AddLiquidity implements types.MsgServer
func (m msgServer) AddLiquidity(ctx context.Context, msg *types.MsgAddLiquidity) (*types.MsgAddLiquidityResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	provider, err := sdk.AccAddressFromBech32(msg.Provider)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	if msg.TokenAAmount == nil || msg.TokenBAmount == nil {
		return nil, fmt.Errorf("token_a_amount and token_b_amount cannot be nil")
	}
	err = m.k.AddLiquidity(ctx, provider, msg.PoolId, *msg.TokenAAmount, *msg.TokenBAmount)
	if err != nil {
		return nil, err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			types.EventTypeAddLiquidity,
			sdk.NewAttribute(types.AttributeKeyPoolId, fmt.Sprintf("%d", msg.PoolId)),
			sdk.NewAttribute(types.AttributeKeyProvider, msg.Provider),
			sdk.NewAttribute(types.AttributeKeyTokenAAmount, msg.TokenAAmount.String()),
			sdk.NewAttribute(types.AttributeKeyTokenBAmount, msg.TokenBAmount.String()),
		),
	})

	return &types.MsgAddLiquidityResponse{}, nil
}

// RemoveLiquidity implements types.MsgServer
func (m msgServer) RemoveLiquidity(ctx context.Context, msg *types.MsgRemoveLiquidity) (*types.MsgRemoveLiquidityResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	provider, err := sdk.AccAddressFromBech32(msg.Provider)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	if msg.LiquidityTokens == nil {
		return nil, fmt.Errorf("liquidity_tokens cannot be nil")
	}
	tokenAOut, tokenBOut, err := m.k.RemoveLiquidity(ctx, provider, msg.PoolId, *msg.LiquidityTokens)
	if err != nil {
		return nil, err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			types.EventTypeRemoveLiquidity,
			sdk.NewAttribute(types.AttributeKeyPoolId, fmt.Sprintf("%d", msg.PoolId)),
			sdk.NewAttribute(types.AttributeKeyProvider, msg.Provider),
			sdk.NewAttribute(types.AttributeKeyTokenAOut, tokenAOut.String()),
			sdk.NewAttribute(types.AttributeKeyTokenBOut, tokenBOut.String()),
		),
	})

	return &types.MsgRemoveLiquidityResponse{
		TokenAAmount: &tokenAOut,
		TokenBAmount: &tokenBOut,
	}, nil
}

// Swap implements types.MsgServer
func (m msgServer) Swap(ctx context.Context, msg *types.MsgSwap) (*types.MsgSwapResponse, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	sender, err := sdk.AccAddressFromBech32(msg.Sender)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	if msg.TokenIn == nil || msg.MinTokenOut == nil {
		return nil, fmt.Errorf("token_in and min_token_out cannot be nil")
	}
	tokenOut, err := m.k.Swap(ctx, sender, msg.PoolId, *msg.TokenIn, msg.TokenOutDenom, *msg.MinTokenOut)
	if err != nil {
		return nil, err
	}

	sdkCtx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			types.EventTypeSwap,
			sdk.NewAttribute(types.AttributeKeyPoolId, fmt.Sprintf("%d", msg.PoolId)),
			sdk.NewAttribute(types.AttributeKeySender, msg.Sender),
			sdk.NewAttribute(types.AttributeKeyTokenIn, msg.TokenIn.String()),
			sdk.NewAttribute(types.AttributeKeyTokenOut, tokenOut.String()),
		),
	})

	return &types.MsgSwapResponse{TokenOut: &tokenOut}, nil
}

// UpdateParams implements types.MsgServer
func (m msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	if m.k.GetAuthority() != msg.Authority {
		return nil, fmt.Errorf("invalid authority; expected %s, got %s", m.k.GetAuthority(), msg.Authority)
	}

	if msg.Params == nil {
		return nil, fmt.Errorf("params cannot be nil")
	}
	err := m.k.SetParams(ctx, *msg.Params)
	if err != nil {
		return nil, err
	}

	return &types.MsgUpdateParamsResponse{}, nil
}
