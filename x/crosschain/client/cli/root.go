package cli

import (
	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
)

// GetTxCmd returns the transaction commands for this module
func GetTxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "crosschain",
		Short:                      "Crosschain transaction subcommands",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}

	cmd.AddCommand(CmdInitiateBridgeTransfer())
	cmd.AddCommand(CmdCompleteBridgeTransfer())
	cmd.AddCommand(CmdUpdateParams())

	return cmd
}