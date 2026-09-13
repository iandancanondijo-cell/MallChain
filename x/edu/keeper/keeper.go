package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"marketplace/x/edu/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	authority    []byte

	Schema          collections.Schema
	Params          collections.Item[types.Params]
	DocumentRecord  collections.Map[string, types.DocumentRecord]
	RecordSeq       collections.Sequence
	DocVersionIndex collections.Map[collections.Pair[string, uint32], string]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,

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

		Params:         collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		DocumentRecord: collections.NewMap(sb, types.DocumentRecordKey, "documentRecord", collections.StringKey, codec.CollValue[types.DocumentRecord](cdc)),
		RecordSeq:      collections.NewSequence(sb, types.RecordSeqKey, "recordSeq"),
		DocVersionIndex: collections.NewMap(sb, types.DocVersionIndexKey, "docVersionIndex",
			collections.PairKeyCodec(collections.StringKey, collections.Uint32Key), collections.StringValue),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

func (k Keeper) GetAuthority() []byte {
	return k.authority
}
