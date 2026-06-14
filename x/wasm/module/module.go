package module

import (
	"context"
	"encoding/json"

	"cosmossdk.io/core/appmodule"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"github.com/spf13/cobra"

	"marketplace/x/wasm/client/cli"
	"marketplace/x/wasm/keeper"
	"marketplace/x/wasm/types"
)

var (
	_ module.AppModuleBasic = AppModule{}
	_ module.AppModule      = AppModule{}
	_ appmodule.AppModule   = AppModule{}
)

type AppModuleBasic struct{}

func (AppModuleBasic) Name() string {
	return types.ModuleName
}

func (AppModuleBasic) RegisterLegacyAminoCodec(cdc *codec.LegacyAmino) {}

func (AppModuleBasic) RegisterGRPCGatewayRoutes(clientCtx client.Context, mux *runtime.ServeMux) {}

func (AppModuleBasic) GetTxCmd() *cobra.Command {
	return cli.GetTxCmd()
}

func (AppModuleBasic) GetQueryCmd() *cobra.Command {
	return cli.GetQueryCmd()
}

func (AppModuleBasic) RegisterInterfaces(reg codectypes.InterfaceRegistry) {
	types.RegisterInterfaces(reg)
}

func (AppModuleBasic) DefaultGenesis(cdc codec.JSONCodec) json.RawMessage {
	return nil
}

func (AppModuleBasic) ValidateGenesis(cdc codec.JSONCodec, _ json.RawMessage) error {
	return nil
}

type AppModule struct {
	AppModuleBasic
	keeper keeper.Keeper
	cdc    codec.Codec
}

func NewAppModule(cdc codec.Codec, k keeper.Keeper) AppModule {
	return AppModule{
		AppModuleBasic: AppModuleBasic{},
		keeper:         k,
		cdc:            cdc,
	}
}

func (AppModule) IsAppModule() {}

func (m AppModule) Name() string {
	return types.ModuleName
}

func (m AppModule) RegisterServices(cfg module.Configurator) {
	msgServer := keeper.NewMsgServerImpl(m.keeper)
	types.RegisterMsgServer(cfg.MsgServer(), msgServer)
	queryServer := keeper.NewQueryServerImpl(m.keeper)
	types.RegisterQueryServer(cfg.QueryServer(), queryServer)
}

func (AppModule) InitGenesis(ctx context.Context, cdc codec.JSONCodec, bz json.RawMessage) error {
	return nil
}

func (AppModule) ExportGenesis(ctx context.Context, cdc codec.JSONCodec) json.RawMessage {
	return nil
}

func (AppModule) ConsensusVersion() uint64 { return 1 }

func (AppModule) BeginBlock(ctx context.Context) error { return nil }

func (AppModule) EndBlock(ctx context.Context) error { return nil }

func (AppModule) IsOnePerModuleType() {}

type AppModuleGenesis = AppModule