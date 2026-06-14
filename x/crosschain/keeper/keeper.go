package keeper

import (
	"errors"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/store"
	"cosmossdk.io/log"
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/query"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"marketplace/x/crosschain/types"
)

type Keeper struct {
	cdc          codec.BinaryCodec
	storeService store.KVStoreService
	logger       log.Logger

	// state management
	Schema          collections.Schema
	Params          collections.Item[types.Params]
	BridgeState     collections.Item[types.BridgeState]
	BridgeTransfers collections.Map[uint64, types.BridgeTransfer]

	// keepers
	accountKeeper types.AccountKeeper
	bankKeeper    types.BankKeeper
	ibcKeeper     types.IBCTransferKeeper
}

// NewKeeper creates a new crosschain Keeper instance
func NewKeeper(
	cdc codec.BinaryCodec,
	storeService store.KVStoreService,
	logger log.Logger,
	accountKeeper types.AccountKeeper,
	bankKeeper types.BankKeeper,
	ibcKeeper types.IBCTransferKeeper,
) Keeper {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		cdc:             cdc,
		storeService:    storeService,
		logger:          logger.With("module", fmt.Sprintf("x/%s", types.ModuleName)),
		accountKeeper:   accountKeeper,
		bankKeeper:      bankKeeper,
		ibcKeeper:       ibcKeeper,
		Params:          collections.NewItem(sb, collections.NewPrefix(types.ParamsKey), "params", codec.CollValue[types.Params](cdc)),
		BridgeState:     collections.NewItem(sb, collections.NewPrefix(types.BridgeStateKey), "bridge_state", codec.CollValue[types.BridgeState](cdc)),
		BridgeTransfers: collections.NewMap(sb, collections.NewPrefix(types.BridgeTransferKeyPrefix), "bridge_transfers", collections.Uint64Key, codec.CollValue[types.BridgeTransfer](cdc)),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority(ctx sdk.Context) (string, error) {
	params, err := k.GetParams(ctx)
	if err != nil {
		return "", err
	}
	return params.AdminAddress, nil
}

// GetParams returns the current module parameters
func (k Keeper) GetParams(ctx sdk.Context) (types.Params, error) {
	params, err := k.Params.Get(ctx)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return types.Params{}, nil
		}
		return types.Params{}, err
	}
	return params, nil
}

// SetParams sets the module parameters
func (k Keeper) SetParams(ctx sdk.Context, params types.Params) error {
	return k.Params.Set(ctx, params)
}

// GetBridgeTransfer returns a bridge transfer by ID.
func (k Keeper) GetBridgeTransfer(ctx sdk.Context, transferId uint64) (types.BridgeTransfer, error) {
	transfer, err := k.BridgeTransfers.Get(ctx, transferId)
	if err != nil {
		return types.BridgeTransfer{}, err
	}
	return transfer, nil
}

// GetBridgeState returns the current bridge state.
func (k Keeper) GetBridgeState(ctx sdk.Context) (types.BridgeState, error) {
	state, err := k.BridgeState.Get(ctx)
	if err != nil {
		return types.BridgeState{}, err
	}
	return state, nil
}

// InitiateBridgeTransfer initiates a new cross-chain bridge transfer
func (k Keeper) InitiateBridgeTransfer(ctx sdk.Context, msg *types.MsgInitiateBridgeTransfer) (uint64, error) {
	params, err := k.GetParams(ctx)
	if err != nil {
		return 0, err
	}

	// Validate destination chain
	validChain := false
	for _, chain := range params.SupportedChains {
		if chain == msg.DestinationChain {
			validChain = true
			break
		}
	}
	if !validChain {
		return 0, types.ErrInvalidChain
	}

	// Validate transfer amount (compare numeric values)
	if msg.Amount.Amount.LT(math.NewIntFromUint64(params.MinTransferAmount)) || msg.Amount.Amount.GT(math.NewIntFromUint64(params.MaxTransferAmount)) {
		return 0, types.ErrInvalidAmount
	}

	senderAddr, err := sdk.AccAddressFromBech32(msg.Sender)
	if err != nil {
		return 0, err
	}

	coins := sdk.NewCoins(msg.Amount)
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, senderAddr, types.ModuleName, coins); err != nil {
		return 0, err
	}

	// Get bridge state
	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		bridgeState = types.BridgeState{}
	}

	// Create new transfer
	transferId := bridgeState.NextTransferId
	amount := msg.Amount // Make a copy
	transfer := types.BridgeTransfer{
		Id:               transferId,
		Sender:           msg.Sender,
		Recipient:        msg.Recipient,
		Amount:           &amount,
		SourceChain:      "marketplace",
		DestinationChain: msg.DestinationChain,
		AssetDenom:       msg.Amount.Denom,
		Status:           "pending",
		Timestamp:        uint64(ctx.BlockTime().Unix()),
	}

	// Store transfer
	if err := k.BridgeTransfers.Set(ctx, transferId, transfer); err != nil {
		return 0, err
	}

	// Update bridge state
	bridgeState.NextTransferId++
	// Store a copy to avoid pointer to local variable
	transferCopy := transfer
	bridgeState.PendingTransfers = append(bridgeState.PendingTransfers, &transferCopy)

	if err := k.BridgeState.Set(ctx, bridgeState); err != nil {
		return 0, err
	}

	return transferId, nil
}

// CompleteBridgeTransfer completes a cross-chain bridge transfer
func (k Keeper) CompleteBridgeTransfer(ctx sdk.Context, msg *types.MsgCompleteBridgeTransfer) error {
	// Get transfer
	transfer, err := k.BridgeTransfers.Get(ctx, msg.TransferId)
	if err != nil {
		return types.ErrTransferNotFound
	}

	if transfer.Status != "pending" {
		return types.ErrTransferAlreadyCompleted
	}

	// Require a proof for transfer completion
	if msg.Proof == "" {
		return types.ErrInvalidProof
	}

	// Ensure the validator is authorized by module authority
	authority, err := k.GetAuthority(ctx)
	if err != nil {
		return err
	}
	if authority == "" || authority != msg.Validator {
		return types.ErrUnauthorized
	}

	// Ensure module has sufficient balance (prevent unbacked minting)
	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)
	moduleCoins := k.bankKeeper.SpendableCoins(ctx, moduleAddr)
	if transfer.Amount == nil {
		return types.ErrInvalidAmount
	}
	if !moduleCoins.IsAllGTE(sdk.NewCoins(*transfer.Amount)) {
		return types.ErrInsufficientModuleBalance
	}

	recipientAddr, err := sdk.AccAddressFromBech32(transfer.Recipient)
	if err != nil {
		return err
	}

	coins := sdk.NewCoins(*transfer.Amount)
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, recipientAddr, coins); err != nil {
		return err
	}

	// Update transfer status
	transfer.Status = "completed"
	if err := k.BridgeTransfers.Set(ctx, msg.TransferId, transfer); err != nil {
		return err
	}

	// Update bridge state
	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		return err
	}

	// Remove from pending
	var newPending []*types.BridgeTransfer
	for _, t := range bridgeState.PendingTransfers {
		if t != nil && t.Id != msg.TransferId {
			newPending = append(newPending, t)
		}
	}
	bridgeState.PendingTransfers = newPending

	if err := k.BridgeState.Set(ctx, bridgeState); err != nil {
		return err
	}

	return nil
}

// GetAllBridgeTransfers returns all bridge transfers with pagination
func (k Keeper) GetAllBridgeTransfers(ctx sdk.Context, req *query.PageRequest) ([]types.BridgeTransfer, *query.PageResponse, error) {
	results, pageRes, err := query.CollectionPaginate(ctx, k.BridgeTransfers, req, func(key uint64, transfer types.BridgeTransfer) (types.BridgeTransfer, error) {
		return transfer, nil
	})
	if err != nil {
		return nil, nil, err
	}

	return results, pageRes, nil
}
