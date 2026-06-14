package vault

import (
	"context"
	"encoding/json"

	"cosmossdk.io/core/appmodule"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"google.golang.org/grpc"

	"marketplace/x/vault/keeper"
	"marketplace/x/vault/types"
)

var (
	_ module.AppModule          = (*AppModule)(nil)
	_ appmodule.AppModule       = (*AppModule)(nil)
	_ appmodule.HasBeginBlocker = (*AppModule)(nil)
)

type AppModule struct {
	cdc    codec.Codec
	keeper *keeper.Keeper
}

func NewAppModule(cdc codec.Codec, k *keeper.Keeper) AppModule {
	return AppModule{cdc: cdc, keeper: k}
}

func (AppModule) IsAppModule() {}

func (AppModule) Name() string { return types.ModuleName }

func (AppModule) RegisterLegacyAminoCodec(*codec.LegacyAmino) {}

func (AppModule) RegisterGRPCGatewayRoutes(clientCtx client.Context, mux *runtime.ServeMux) {
	// no-op for now
}

func (AppModule) RegisterInterfaces(registrar codectypes.InterfaceRegistry) {}

func (am AppModule) RegisterServices(registrar grpc.ServiceRegistrar) error {
	types.RegisterMsgServer(registrar, keeper.NewMsgServerImpl(am.keeper))
	return nil
}

func (AppModule) DefaultGenesis(codec.JSONCodec) json.RawMessage { return nil }
func (AppModule) ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage) error {
	return nil
}
func (AppModule) InitGenesis(ctx context.Context, _ codec.JSONCodec, _ json.RawMessage) {}
func (AppModule) ExportGenesis(ctx context.Context, _ codec.JSONCodec) json.RawMessage  { return nil }
func (AppModule) ConsensusVersion() uint64                                              { return 1 }
func (AppModule) BeginBlock(_ context.Context) error                                    { return nil }
func (AppModule) EndBlock(_ context.Context) error                                      { return nil }
