package module

import (
	"context"
	"encoding/json"

	"github.com/cosmos/cosmos-sdk/codec"

	"marketplace/x/marketplace/keeper"
	"marketplace/x/marketplace/types"
)

type AppModule struct {
	cdc    codec.Codec
	keeper keeper.Keeper
}

func NewAppModule(cdc codec.Codec, keeper keeper.Keeper) AppModule {
	return AppModule{
		cdc:    cdc,
		keeper: keeper,
	}
}

func (am AppModule) Name() string {
	return types.ModuleName
}

func (am AppModule) DefaultGenesis(cdc codec.JSONCodec) json.RawMessage {
	return json.RawMessage("{}")
}

func (am AppModule) ValidateGenesis(cdc codec.JSONCodec, config interface{}, bz json.RawMessage) error {
	return nil
}

func (am AppModule) InitGenesis(ctx context.Context, cdc codec.JSONCodec, bz json.RawMessage) error {
	return nil
}

func (am AppModule) ExportGenesis(ctx context.Context, cdc codec.JSONCodec) json.RawMessage {
	return json.RawMessage("{}")
}

func (am AppModule) BeginBlock() {
}
