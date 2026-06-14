package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"marketplace/x/mallpoints/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	badgeKeeper  types.BadgeKeeper
	mlcoinKeeper types.MlcoinKeeper

	Schema              collections.Schema
	Params              collections.Item[types.Params]
	UserPoints          collections.Map[string, types.UserPoints]
	MonthlyPointsIssued collections.Map[string, uint64]
	ConversionWindow    collections.Item[types.ConversionWindow]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	badgeKeeper types.BadgeKeeper,
	mlcoinKeeper types.MlcoinKeeper,

) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		authority:    authority,
		badgeKeeper:  badgeKeeper,
		mlcoinKeeper: mlcoinKeeper,

		Params:              collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		UserPoints:          collections.NewMap(sb, types.UserPointsKey, "userPoints", collections.StringKey, codec.CollValue[types.UserPoints](cdc)),
		MonthlyPointsIssued: collections.NewMap(sb, types.MonthlyPointsIssuedKey, "monthlyPointsIssued", collections.StringKey, collections.Uint64Value),
		ConversionWindow:    collections.NewItem(sb, types.ConversionWindowKey, "conversionWindow", codec.CollValue[types.ConversionWindow](cdc)),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}
