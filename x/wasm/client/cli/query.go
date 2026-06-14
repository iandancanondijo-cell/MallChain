package cli

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
)

func GetQueryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "wasm",
		Short: "Wasm contract query subcommands",
	}

	cmd.AddCommand(
		CmdQueryContract(),
		CmdListContracts(),
		CmdGetCode(),
	)

	return cmd
}

func CmdQueryContract() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "contract [contract-address] [query-msg-file]",
		Short: "Query a wasm contract",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			contractAddr := args[0]

			return clientCtx.PrintString(fmt.Sprintf(`{"contract_address":"%s","query":"%s"}`, contractAddr, args[1]))
		},
	}

	flags.AddQueryFlagsToCmd(cmd)

	return cmd
}

func CmdListContracts() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "contracts",
		Short: "List all contracts",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}

	flags.AddQueryFlagsToCmd(cmd)

	return cmd
}

func CmdGetCode() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "code [code-id]",
		Short: "Get contract code by ID",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			output, _ := json.Marshal(map[string]interface{}{
				"code_id": args[0],
				"note":    "Code retrieval via CLI not yet implemented",
			})

			return clientCtx.PrintString(string(output))
		},
	}

	flags.AddQueryFlagsToCmd(cmd)

	return cmd
}