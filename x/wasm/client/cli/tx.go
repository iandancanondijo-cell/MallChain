package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/tx"

	"marketplace/x/wasm/types"
)

func GetTxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "wasm",
		Short:                      "Wasm contract transaction subcommands",
		DisableFlagParsing:         false,
		SuggestionsMinimumDistance: 2,
	}

	cmd.AddCommand(
		CmdStoreCode(),
		CmdInstantiateContract(),
		CmdExecuteContract(),
	)

	return cmd
}

func CmdStoreCode() *cobra.Command {
	cmd := &cobra.Command{
		Use:  "store [wasm-file]",
		Short: "Store a wasm contract",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			wasmFile := args[0]

			bz, err := os.ReadFile(wasmFile)
			if err != nil {
				return err
			}

			msg := &types.MsgStoreCode{
				WasmCode: bz,
				Sender:   clientCtx.GetFromAddress().String(),
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}

func CmdInstantiateContract() *cobra.Command {
	var label string

	cmd := &cobra.Command{
		Use:  "instantiate [code-id] [init-msg-file]",
		Short: "Instantiate a wasm contract",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			var codeID uint64
			if _, err := fmt.Sscanf(args[0], "%d", &codeID); err != nil {
				return err
			}

			initMsgFile := args[1]

			bz, err := os.ReadFile(initMsgFile)
			if err != nil {
				return err
			}

			msg := &types.MsgInstantiateContract{
				Sender:   clientCtx.GetFromAddress().String(),
				CodeID:   codeID,
				Label:    label,
				InitMsg:  bz,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	cmd.Flags().StringVar(&label, "label", "", "Label for the contract")

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}

func CmdExecuteContract() *cobra.Command {
	cmd := &cobra.Command{
		Use:  "execute [contract-address] [execute-msg-file]",
		Short: "Execute a wasm contract",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			contractAddr := args[0]
			executeMsgFile := args[1]

			bz, err := os.ReadFile(executeMsgFile)
			if err != nil {
				return err
			}

			msg := &types.MsgExecuteContract{
				Sender:          clientCtx.GetFromAddress().String(),
				ContractAddress: contractAddr,
				Msg:             bz,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}