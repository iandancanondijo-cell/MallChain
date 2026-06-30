package app

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"io"

	clienthelpers "cosmossdk.io/client/v2/helpers"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/depinject"
	"cosmossdk.io/log"
	storetypes "cosmossdk.io/store/types"
	circuitkeeper "cosmossdk.io/x/circuit/keeper"
	upgradekeeper "cosmossdk.io/x/upgrade/keeper"

	abci "github.com/cometbft/cometbft/abci/types"
	dbm "github.com/cosmos/cosmos-db"
	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/server"
	"github.com/cosmos/cosmos-sdk/server/api"
	"github.com/cosmos/cosmos-sdk/server/config"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/cosmos/cosmos-sdk/x/auth"
	authante "github.com/cosmos/cosmos-sdk/x/auth/ante"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	authsims "github.com/cosmos/cosmos-sdk/x/auth/simulation"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	authzkeeper "github.com/cosmos/cosmos-sdk/x/authz/keeper"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	consensuskeeper "github.com/cosmos/cosmos-sdk/x/consensus/keeper"
	distrkeeper "github.com/cosmos/cosmos-sdk/x/distribution/keeper"
	"github.com/cosmos/cosmos-sdk/x/genutil"
	genutiltypes "github.com/cosmos/cosmos-sdk/x/genutil/types"
	govkeeper "github.com/cosmos/cosmos-sdk/x/gov/keeper"
	mintkeeper "github.com/cosmos/cosmos-sdk/x/mint/keeper"
	paramskeeper "github.com/cosmos/cosmos-sdk/x/params/keeper"
	paramstypes "github.com/cosmos/cosmos-sdk/x/params/types"
	slashingkeeper "github.com/cosmos/cosmos-sdk/x/slashing/keeper"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"
	icacontrollerkeeper "github.com/cosmos/ibc-go/v10/modules/apps/27-interchain-accounts/controller/keeper"
	icahostkeeper "github.com/cosmos/ibc-go/v10/modules/apps/27-interchain-accounts/host/keeper"
	ibctransferkeeper "github.com/cosmos/ibc-go/v10/modules/apps/transfer/keeper"
	ibckeeper "github.com/cosmos/ibc-go/v10/modules/core/keeper"

	"marketplace/docs"
	badgemodulekeeper "marketplace/x/badge/keeper"
	mallcoinmodulekeeper "marketplace/x/mallcoin/keeper"
	mallpointsmodulekeeper "marketplace/x/mallpoints/keeper"
	mlcoinmodulekeeper "marketplace/x/mlcoin/keeper"
)

const (
	// Name is the name of the application.
	Name = "marketplace"
	// AccountAddressPrefix is the prefix for accounts addresses.
	// Use "mall" so bech32 addresses look like mall1... per production config.
	AccountAddressPrefix = "mall"
	// ChainCoinType is the coin type of the chain.
	ChainCoinType = 118
)

// DefaultNodeHome default home directories for the application daemon
var DefaultNodeHome string

var (
	_ runtime.AppI            = (*App)(nil)
	_ servertypes.Application = (*App)(nil)
)

// App extends an ABCI application, but with most of its parameters exported.
// They are exported for convenience in creating helper functions, as object
// capabilities aren't needed for testing.
type App struct {
	*runtime.App
	legacyAmino       *codec.LegacyAmino
	appCodec          codec.Codec
	txConfig          client.TxConfig
	interfaceRegistry codectypes.InterfaceRegistry

	// keepers
	// only keepers required by the app are exposed
	// the list of all modules is available in the app_config
	AuthKeeper            authkeeper.AccountKeeper
	BankKeeper            bankkeeper.Keeper
	StakingKeeper         *stakingkeeper.Keeper
	SlashingKeeper        slashingkeeper.Keeper
	MintKeeper            mintkeeper.Keeper
	DistrKeeper           distrkeeper.Keeper
	GovKeeper             *govkeeper.Keeper
	UpgradeKeeper         *upgradekeeper.Keeper
	AuthzKeeper           authzkeeper.Keeper
	ConsensusParamsKeeper consensuskeeper.Keeper
	CircuitBreakerKeeper  circuitkeeper.Keeper
	ParamsKeeper          paramskeeper.Keeper

	// ibc keepers
	IBCKeeper           *ibckeeper.Keeper
	ICAControllerKeeper icacontrollerkeeper.Keeper
	ICAHostKeeper       icahostkeeper.Keeper
	TransferKeeper      ibctransferkeeper.Keeper

	// simulation manager
	sm               *module.SimulationManager
	MallcoinKeeper   mallcoinmodulekeeper.Keeper
	MlcoinKeeper     *mlcoinmodulekeeper.Keeper
	MallpointsKeeper mallpointsmodulekeeper.Keeper
	BadgeKeeper      badgemodulekeeper.Keeper

	// Future 2026 feature keepers:
	// - AgentKeeper for autonomous workflow authorization
	// - AAKeeper for smart wallet / account abstraction support
	// - RWAKeeper for real-world asset tokenization and custody primitives
	// - PrivacyKeeper for selective disclosure and proof-enabled transfers
}

func init() {
	var err error
	clienthelpers.EnvPrefix = Name
	DefaultNodeHome, err = clienthelpers.GetNodeHomeDirectory("." + Name)
	if err != nil {
		panic(err)
	}
}

// AppConfig returns the default app config.
func AppConfig() depinject.Config {
	return depinject.Configs(
		appConfig,
		depinject.Supply(
			// supply custom module basics
			map[string]module.AppModuleBasic{
				genutiltypes.ModuleName: genutil.NewAppModuleBasic(genutiltypes.DefaultMessageValidator),
			},
		),
	)
}

// New returns a reference to an initialized App.
func New(
	logger log.Logger,
	db dbm.DB,
	traceStore io.Writer,
	loadLatest bool,
	appOpts servertypes.AppOptions,
	baseAppOptions ...func(*baseapp.BaseApp),
) *App {
	var (
		app        = &App{}
		appBuilder *runtime.AppBuilder

		// Dedicated KV store for ante state:
		// - rate limit counters
		// - replay hash tracking (with bounded retention)
		anteStoreKey = storetypes.NewKVStoreKey("ante")
	)

	// merge the AppConfig and other configuration in one config
	appConfig = depinject.Configs(
		AppConfig(),
		depinject.Supply(
			appOpts, // supply app options
			logger,  // supply logger

			// Supply with IBC keeper getter for the IBC modules with App Wiring.
			// The IBC Keeper cannot be passed because it has not been initiated yet.
			// Passing the getter, the app IBC Keeper will always be accessible.
			// This needs to be removed after IBC supports App Wiring.
			app.GetIBCKeeper,

			// here alternative options can be supplied to the DI container.
			// those options can be used f.e to override the default behavior of some modules.
			// for instance supplying a custom address codec for not using bech32 addresses.
			// read the depinject documentation and depinject module wiring for more information
			// on available options and how to use them.
		),
		// Provide custom signers via a provider function so depinject calls it
		// at the right time before ProvideInterfaceRegistry
		depinject.Provide(ProvideCustomGetSignersForRuntime),
	)

	// NOTE: ante store key is only usable after app/baseapp store is initialized.
	// The wrapper will skip rate-limit/replay logic if the store key is not present.

	var appModules map[string]appmodule.AppModule
	if err := depinject.Inject(appConfig,
		&appBuilder,
		&appModules,
		&app.appCodec,
		&app.legacyAmino,
		&app.txConfig,
		&app.interfaceRegistry,
		&app.AuthKeeper,
		&app.BankKeeper,
		&app.StakingKeeper,
		&app.SlashingKeeper,
		&app.MintKeeper,
		&app.DistrKeeper,
		&app.GovKeeper,
		&app.UpgradeKeeper,
		&app.AuthzKeeper,
		&app.ConsensusParamsKeeper,
		&app.CircuitBreakerKeeper,
		&app.ParamsKeeper,
		&app.MallcoinKeeper,
		&app.MlcoinKeeper,
		&app.MallpointsKeeper,
		&app.BadgeKeeper,
	); err != nil {
		panic(err)
	}

	// add to default baseapp options
	// enable optimistic execution
	baseAppOptions = append(baseAppOptions, baseapp.SetOptimisticExecution())

	// build an AnteHandler using the SDK's default auth ante handler and
	// wrap it to emit lightweight audit events (and provide scaffolding for
	// rate-limiting and replay-protection). We create the ante handler here
	// because we have access to the required keepers from depinject above.
	anteHandler, err := authante.NewAnteHandler(authante.HandlerOptions{
		AccountKeeper:   app.AuthKeeper,
		BankKeeper:      app.BankKeeper,
		SignModeHandler: app.txConfig.SignModeHandler(),
		SigGasConsumer:  authante.DefaultSigVerificationGasConsumer,
	})
	if err != nil {
		panic(err)
	}

	// wrappedAnte emits an audit event and delegates to the SDK ante handler.
	wrappedAnte := func(ctx sdk.Context, tx sdk.Tx, simulate bool) (sdk.Context, error) {
		curH := uint64(ctx.BlockHeight())

		// Emit a simple audit event with minimal info (no sensitive data)
		ev := sdk.NewEvent(
			"tx_audit",
			sdk.NewAttribute("num_msgs", fmt.Sprintf("%d", len(tx.GetMsgs()))),
			sdk.NewAttribute("simulate", fmt.Sprintf("%t", simulate)),
			sdk.NewAttribute("height", fmt.Sprintf("%d", curH)),
		)
		ctx.EventManager().EmitEvent(ev)

		// Area 1 defaults (to be parameterized via params/governance later):
		const (
			perAddrPerBlockLimit         = uint64(10)
			defaultReplayRetentionBlocks = uint64(200)
		)

		// Use dedicated ante KV store for rate limiting + replay tracking.
		storeKey := app.GetKey(anteStoreKey.Name())
		if storeKey != nil && !simulate {
			store := ctx.KVStore(storeKey)

			// Get sender address for per-sender rate limiting
			msgs := tx.GetMsgs()
			var sender string
			if len(msgs) > 0 {
				// Extract sender from first message
				if signers, ok := msgs[0].(interface{ GetSigners() []sdk.AccAddress }); ok {
					s := signers.GetSigners()
					if len(s) > 0 {
						sender = s[0].String()
					}
				}
			}
			
			// Fall back to generic key if no sender found
			if sender == "" {
				sender = "unknown"
			}

			// Rate limiting: counter per-sender per-block
			rlKeyPrefix := []byte("ante:rl:sender:")
			rlKey := append(rlKeyPrefix, []byte(sender)...)
			rlKey = append(rlKey, []byte(":height")...)
			
			val := store.Get(rlKey)
			var storedHeight uint64
			var count uint64
			if val != nil && len(val) == 16 {
				storedHeight = binary.BigEndian.Uint64(val[:8])
				count = binary.BigEndian.Uint64(val[8:16])
			}

			if storedHeight < curH {
				// reset for new block
				storedHeight = curH
				count = 1
			} else {
				count++
			}

			if count > perAddrPerBlockLimit {
				evReject := sdk.NewEvent(
					"tx_audit",
					sdk.NewAttribute("reject_reason", "rate_limit"),
					sdk.NewAttribute("height", fmt.Sprintf("%d", curH)),
					sdk.NewAttribute("sender", sender),
				)
				ctx.EventManager().EmitEvent(evReject)
				app.Logger().Info("ante rejected tx: rate limit exceeded", "height", curH, "sender", sender, "count", count)
				return ctx, fmt.Errorf("rate limit exceeded for sender %s", sender)
			}

			// write back updated counter
			buf := make([]byte, 16)
			binary.BigEndian.PutUint64(buf[:8], storedHeight)
			binary.BigEndian.PutUint64(buf[8:16], count)
			store.Set(rlKey, buf)

			// Replay protection: hash tx bytes and ensure not seen before.
			// Store value is 8-byte big-endian height.
			encoder := app.txConfig.TxEncoder()
			if encoder != nil {
				if b, err := encoder(tx); err == nil {
					h := sha256.Sum256(b)
					replayPrefix := []byte("ante:replay:")
					replayKey := append(replayPrefix, h[:]...)

					if store.Has(replayKey) {
						evReject := sdk.NewEvent(
							"tx_audit",
							sdk.NewAttribute("reject_reason", "replay_detected"),
							sdk.NewAttribute("height", fmt.Sprintf("%d", curH)),
						)
						ctx.EventManager().EmitEvent(evReject)
						app.Logger().Info("ante rejected tx: replay detected", "height", curH)
						return ctx, fmt.Errorf("replayed transaction")
					}

					// Prune older replay keys (bounded retention).
					pruneBefore := uint64(0)
					if defaultReplayRetentionBlocks < curH {
						pruneBefore = curH - defaultReplayRetentionBlocks
					}

					// Safe two-pass pruning:
					// 1) collect replay keys older than pruneBefore
					// 2) delete them after iteration completes
					var toDelete [][]byte
					iter := storetypes.KVStorePrefixIterator(store, replayPrefix)
					for ; iter.Valid(); iter.Next() {
						k := iter.Key()
						v := iter.Value()
						if len(v) != 8 {
							continue
						}
						seenH := binary.BigEndian.Uint64(v)
						if seenH < pruneBefore {
							// copy key bytes because iterator backing storage may be reused
							keyCopy := make([]byte, len(k))
							copy(keyCopy, k)
							toDelete = append(toDelete, keyCopy)
						}
					}
					_ = iter.Close()

					for _, k := range toDelete {
						store.Delete(k)
					}

					// mark replay seen with current height
					heightBuf := make([]byte, 8)
					binary.BigEndian.PutUint64(heightBuf, curH)
					store.Set(replayKey, heightBuf)
				}
			} else {
				app.Logger().Debug("ante replay protection skipped: tx encoder unavailable")
			}
		}

		// Delegate to standard ante handler
		return anteHandler(ctx, tx, simulate)
	}

	// We will set the ante handler on the built app below (after Build())

	// build app
	app.App = appBuilder.Build(db, traceStore, baseAppOptions...)

	// set the wrapped ante handler (audit + scaffold for rate-limiting)
	app.App.SetAnteHandler(wrappedAnte)

	// register legacy modules
	if err := app.registerIBCModules(appOpts); err != nil {
		panic(err)
	}

	// register custom modules that don't use proto-based Module config types
	if err := app.registerCustomModules(); err != nil {
		panic(err)
	}

	/****  Module Options ****/

	// create the simulation manager and define the order of the modules for deterministic simulations
	overrideModules := map[string]module.AppModuleSimulation{
		authtypes.ModuleName: auth.NewAppModule(app.appCodec, app.AuthKeeper, authsims.RandomGenesisAccounts, nil),
	}
	app.sm = module.NewSimulationManagerFromAppModules(app.ModuleManager.Modules, overrideModules)

	app.sm.RegisterStoreDecoders()

	// A custom InitChainer sets if extra pre-init-genesis logic is required.
	// This is necessary for manually registered modules that do not support app wiring.
	// Manually set the module version map as shown below.
	// The upgrade module will automatically handle de-duplication of the module version map.
	app.SetInitChainer(func(ctx sdk.Context, req *abci.RequestInitChain) (*abci.ResponseInitChain, error) {
		if err := app.UpgradeKeeper.SetModuleVersionMap(ctx, app.ModuleManager.GetVersionMap()); err != nil {
			return nil, err
		}
		return app.App.InitChainer(ctx, req)
	})

	if err := app.Load(loadLatest); err != nil {
		panic(err)
	}

	return app
}

// GetSubspace returns a param subspace for a given module name.
func (app *App) GetSubspace(moduleName string) paramstypes.Subspace {
	subspace, _ := app.ParamsKeeper.GetSubspace(moduleName)
	return subspace
}

// LegacyAmino returns App's amino codec.
func (app *App) LegacyAmino() *codec.LegacyAmino {
	return app.legacyAmino
}

// AppCodec returns App's app codec.
func (app *App) AppCodec() codec.Codec {
	return app.appCodec
}

// InterfaceRegistry returns App's InterfaceRegistry.
func (app *App) InterfaceRegistry() codectypes.InterfaceRegistry {
	return app.interfaceRegistry
}

// TxConfig returns App's TxConfig
func (app *App) TxConfig() client.TxConfig {
	return app.txConfig
}

// GetKey returns the KVStoreKey for the provided store key.
func (app *App) GetKey(storeKey string) *storetypes.KVStoreKey {
	kvStoreKey, ok := app.UnsafeFindStoreKey(storeKey).(*storetypes.KVStoreKey)
	if !ok {
		return nil
	}
	return kvStoreKey
}

// SimulationManager implements the SimulationApp interface
func (app *App) SimulationManager() *module.SimulationManager {
	return app.sm
}

// RegisterAPIRoutes registers all application module routes with the provided
// API server.
func (app *App) RegisterAPIRoutes(apiSvr *api.Server, apiConfig config.APIConfig) {
	app.App.RegisterAPIRoutes(apiSvr, apiConfig)
	// register swagger API in app.go so that other applications can override easily
	if err := server.RegisterSwaggerAPI(apiSvr.ClientCtx, apiSvr.Router, apiConfig.Swagger); err != nil {
		panic(err)
	}

	// register app's OpenAPI routes.
	docs.RegisterOpenAPIService(Name, apiSvr.Router)
}

// GetMaccPerms returns a copy of the module account permissions
//
// NOTE: This is solely to be used for testing purposes.
func GetMaccPerms() map[string][]string {
	dup := make(map[string][]string)
	for _, perms := range moduleAccPerms {
		dup[perms.GetAccount()] = perms.GetPermissions()
	}

	return dup
}

// BlockedAddresses returns all the app's blocked account addresses.
func BlockedAddresses() map[string]bool {
	result := make(map[string]bool)

	if len(blockAccAddrs) > 0 {
		for _, addr := range blockAccAddrs {
			result[addr] = true
		}
	} else {
		for addr := range GetMaccPerms() {
			result[addr] = true
		}
	}

	return result
}
