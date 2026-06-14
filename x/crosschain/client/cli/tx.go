package cli

import (
	"encoding/json"
	"os"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/tx"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/crosschain/types"
)

var _ = strconv.Itoa(0)

func CmdInitiateBridgeTransfer() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "initiate-bridge-transfer [recipient] [amount] [destination-chain]",
		Short: "Initiate a cross-chain bridge transfer",
		Args:  cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) (err error) {
			argRecipient := args[0]
			argAmount := args[1]
			argDestinationChain := args[2]

			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			amount, err := sdk.ParseCoinNormalized(argAmount)
			if err != nil {
				return err
			}

			msg := types.NewMsgInitiateBridgeTransfer(
				clientCtx.GetFromAddress().String(),
				argRecipient,
				argDestinationChain,
				amount,
			)

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}

func CmdCompleteBridgeTransfer() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "complete-bridge-transfer [transfer-id] [proof]",
		Short: "Complete a cross-chain bridge transfer",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) (err error) {
			argTransferId, err := strconv.ParseUint(args[0], 10, 64)
			if err != nil {
				return err
			}
			argProof := args[1]

			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			msg := types.NewMsgCompleteBridgeTransfer(
				clientCtx.GetFromAddress().String(),
				argTransferId,
				argProof,
			)

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}

func CmdUpdateParams() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "update-params [params-file]",
		Short: "Update the module parameters",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) (err error) {
			argParamsFile := args[0]

			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			params, err := parseParamsFromFile(argParamsFile)
			if err != nil {
				return err
			}

			msg := types.NewMsgUpdateParams(
				clientCtx.GetFromAddress().String(),
				params,
			)

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)

	return cmd
}

func parseParamsFromFile(filePath string) (types.Params, error) {
	var params types.Params

	bz, err := os.ReadFile(filePath)
	if err != nil {
		return params, err
	}

	err = json.Unmarshal(bz, &params)
	return params, err
}
