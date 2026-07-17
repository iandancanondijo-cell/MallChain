package main

import (
	"io"
	"os"

	"marketplace/app"

	dbm "github.com/cosmos/cosmos-db"
	"github.com/cosmos/cosmos-sdk/server"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	svrcmd "github.com/cosmos/cosmos-sdk/server/cmd"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"cosmossdk.io/log"
	"github.com/spf13/cobra"
)

func main() {
	sdk.SetAddrCacheEnabled(false)

	rootCmd := &cobra.Command{
		Use:   app.Name,
		Short: app.Name + " application node",
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			return server.InterceptConfigsPreRunHandler(cmd, "", nil, nil)
		},
	}

	server.AddCommands(rootCmd, app.DefaultNodeHome, newApp, appExport, addModuleInitFlags)

	if err := svrcmd.Execute(rootCmd, "", app.DefaultNodeHome); err != nil {
		os.Exit(1)
	}
}

func addModuleInitFlags(startCmd *cobra.Command) {
	startCmd.Flags().Uint64("inv-check-period", 0, "Block period for the inv app version check (0 to disable)")
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
