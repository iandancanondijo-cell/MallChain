package main

import (
	"io"
	"os"

	"marketplace/app"

	dbm "github.com/cosmos/cosmos-db"
	"github.com/cosmos/cosmos-sdk/server"
	svrcmd "github.com/cosmos/cosmos-sdk/server/cmd"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	cmtcfg "github.com/cometbft/cometbft/config"

	"cosmossdk.io/log"
	"github.com/spf13/cobra"
)

func main() {
	sdk.SetAddrCacheEnabled(false)

	rootCmd := &cobra.Command{
		Use:   app.Name,
		Short: app.Name + " application node",
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			return server.InterceptConfigsPreRunHandler(cmd, "", nil, cmtcfg.DefaultConfig())
		},
	}

	server.AddCommands(rootCmd, app.DefaultNodeHome, newApp, appExport, addModuleInitFlags)

	if err := svrcmd.Execute(rootCmd, "", app.DefaultNodeHome); err != nil {
		os.Exit(1)
	}
}

func addModuleInitFlags(startCmd *cobra.Command) {
}

func newApp(
	logger log.Logger,
	db dbm.DB,
	traceWriter io.Writer,
	appOpts servertypes.AppOptions,
) servertypes.Application {
	return app.New(
		logger,
		db,
		traceWriter,
		true,
		appOpts,
		server.DefaultBaseappOptions(appOpts)...,
	)
}

func appExport(
	logger log.Logger,
	db dbm.DB,
	traceWriter io.Writer,
	height int64,
	forZeroHeight bool,
	jailAllowedAddrs []string,
	appOpts servertypes.AppOptions,
	modulesToExport []string,
) (servertypes.ExportedApp, error) {
	mpApp := app.New(
		logger,
		db,
		traceWriter,
		height == -1,
		appOpts,
	)

	if height != -1 {
		if err := mpApp.LoadHeight(height); err != nil {
			return servertypes.ExportedApp{}, err
		}
	}

	return mpApp.ExportAppStateAndValidators(forZeroHeight, jailAllowedAddrs, modulesToExport)
}
