package keeper

import (
	"errors"
	"fmt"

	"cosmossdk.io/collections"
	corestore "cosmossdk.io/core/store"
	"cosmossdk.io/log"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/query"

	"marketplace/x/crosschain/types"
)

const (
	BridgeTransferStatus_PENDING   = "pending"
	BridgeTransferStatus_COMPLETED = "completed"
	BridgeTransferStatus_FAILED    = "failed"
	BridgeTransferStatus_TIMEOUT   = "timeout"
)

type Keeper struct {
	cdc             codec.BinaryCodec
	storeService    corestore.KVStoreService
	logger          log.Logger

	Schema          collections.Schema
	Params          collections.Item[types.Params]
	BridgeState     collections.Item[types.BridgeState]
	BridgeTransfers collections.Map[uint64, types.BridgeTransfer]
	ChainRoutes     collections.Map[string, types.ChainRoute]
	TransferMeta    collections.Map[uint64, types.TransferMeta]
	TransferSeq     collections.Sequence

	accountKeeper   types.AccountKeeper
	bankKeeper      types.BankKeeper
	ibcKeeper       types.IBCTransferKeeper
	stakingKeeper   types.StakingKeeper
	ibcClientKeeper types.IBCClientKeeper
}

func NewKeeper(
	cdc codec.BinaryCodec,
	storeService corestore.KVStoreService,
	logger log.Logger,
	accountKeeper types.AccountKeeper,
	bankKeeper types.BankKeeper,
	ibcKeeper types.IBCTransferKeeper,
	stakingKeeper types.StakingKeeper,
	ibcClientKeeper types.IBCClientKeeper,
) (Keeper, error) {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		cdc:             cdc,
		storeService:    storeService,
		logger:          logger.With("module", fmt.Sprintf("x/%s", types.ModuleName)),
		accountKeeper:   accountKeeper,
		bankKeeper:      bankKeeper,
		ibcKeeper:       ibcKeeper,
		stakingKeeper:   stakingKeeper,
		ibcClientKeeper: ibcClientKeeper,
		Params:          collections.NewItem(sb, collections.NewPrefix(types.ParamsKey), "params", codec.CollValue[types.Params](cdc)),
		BridgeState:     collections.NewItem(sb, collections.NewPrefix(types.BridgeStateKey), "bridge_state", codec.CollValue[types.BridgeState](cdc)),
		BridgeTransfers: collections.NewMap(sb, collections.NewPrefix(types.BridgeTransferKeyPrefix), "bridge_transfers", collections.Uint64Key, codec.CollValue[types.BridgeTransfer](cdc)),
		ChainRoutes:     collections.NewMap(sb, collections.NewPrefix("ChainRoute/value/"), "chain_routes", collections.StringKey, collections.NewJSONValueCodec[types.ChainRoute]()),
		TransferMeta:    collections.NewMap(sb, collections.NewPrefix("TransferMeta/value/"), "transfer_meta", collections.Uint64Key, collections.NewJSONValueCodec[types.TransferMeta]()),
		TransferSeq:     collections.NewSequence(sb, collections.NewPrefix("transfer_seq/"), "transfer_seq"),
	}

	schema, err := sb.Build()
	if err != nil {
		return Keeper{}, err
	}
	k.Schema = schema

	return k, nil
}

func (k Keeper) GetAuthority(sdkCtx sdk.Context) (string, error) {
	params, err := k.GetParams(sdkCtx)
	if err != nil {
		return "", err
	}
	return params.AdminAddress, nil
}

func (k Keeper) GetParams(sdkCtx sdk.Context) (types.Params, error) {
	params, err := k.Params.Get(sdkCtx)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return types.Params{}, nil
		}
		return types.Params{}, err
	}
	return params, nil
}

func (k Keeper) SetParams(sdkCtx sdk.Context, params types.Params) error {
	return k.Params.Set(sdkCtx, params)
}

func (k Keeper) GetBridgeTransfer(sdkCtx sdk.Context, transferId uint64) (types.BridgeTransfer, error) {
	transfer, err := k.BridgeTransfers.Get(sdkCtx, transferId)
	if err != nil {
		return types.BridgeTransfer{}, err
	}
	return transfer, nil
}

func (k Keeper) SetBridgeTransfer(sdkCtx sdk.Context, transfer types.BridgeTransfer) error {
	return k.BridgeTransfers.Set(sdkCtx, transfer.Id, transfer)
}

func (k Keeper) GetBridgeState(sdkCtx sdk.Context) (types.BridgeState, error) {
	state, err := k.BridgeState.Get(sdkCtx)
	if err != nil {
		return types.BridgeState{}, err
	}
	return state, nil
}

func (k Keeper) SetBridgeState(sdkCtx sdk.Context, state types.BridgeState) error {
	return k.BridgeState.Set(sdkCtx, state)
}

func (k Keeper) GetAllBridgeTransfers(sdkCtx sdk.Context, req *query.PageRequest) ([]types.BridgeTransfer, *query.PageResponse, error) {
	results, pageRes, err := query.CollectionPaginate(sdkCtx, k.BridgeTransfers, req, func(key uint64, transfer types.BridgeTransfer) (types.BridgeTransfer, error) {
		return transfer, nil
	})
	if err != nil {
		return nil, nil, err
	}

	return results, pageRes, nil
}
