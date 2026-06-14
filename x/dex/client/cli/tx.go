package cli

import (
	"fmt"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/tx"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/dex/types"
)

// GetTxCmd returns the transaction commands for this module
func GetTxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        types.ModuleName,
		Short:                      fmt.Sprintf("%s transactions subcommands", types.ModuleName),
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}

	cmd.AddCommand(
		CmdCreatePool(),
		CmdAddLiquidity(),
		CmdRemoveLiquidity(),
		CmdSwap(),
		CmdUpdateParams(),
	)

	return cmd
}

// CmdCreatePool returns the command for creating a liquidity pool
func CmdCreatePool() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "create-pool [token-a-amount] [token-b-amount] [fee]",
		Short: "Create a new liquidity pool",
		Args:  cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			tokenAAmount, err := sdk.ParseCoinNormalized(args[0])
			if err != nil {
				return fmt.Errorf("invalid token A amount: %w", err)
			}

			tokenBAmount, err := sdk.ParseCoinNormalized(args[1])
			if err != nil {
				return fmt.Errorf("invalid token B amount: %w", err)
			}

			fee := args[2]

			msg := types.MsgCreatePool{
				Creator: clientCtx.GetFromAddress().String(),
				TokenA:  &tokenAAmount,
				TokenB:  &tokenBAmount,
				Fee:     fee,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), &msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// CmdAddLiquidity returns the command for adding liquidity to a pool
func CmdAddLiquidity() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "add-liquidity [pool-id] [token-a-amount] [token-b-amount]",
		Short: "Add liquidity to an existing pool",
		Args:  cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			poolId, err := strconv.ParseUint(args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid pool ID: %w", err)
			}

			tokenAAmount, err := sdk.ParseCoinNormalized(args[1])
			if err != nil {
				return fmt.Errorf("invalid token A amount: %w", err)
			}

			tokenBAmount, err := sdk.ParseCoinNormalized(args[2])
			if err != nil {
				return fmt.Errorf("invalid token B amount: %w", err)
			}

			msg := types.MsgAddLiquidity{
				Provider:     clientCtx.GetFromAddress().String(),
				PoolId:       poolId,
				TokenAAmount: &tokenAAmount,
				TokenBAmount: &tokenBAmount,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), &msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// CmdRemoveLiquidity returns the command for removing liquidity from a pool
func CmdRemoveLiquidity() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "remove-liquidity [pool-id] [liquidity-tokens]",
		Short: "Remove liquidity from a pool",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			poolId, err := strconv.ParseUint(args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid pool ID: %w", err)
			}

			liquidityTokens, err := sdk.ParseCoinNormalized(args[1])
			if err != nil {
				return fmt.Errorf("invalid liquidity tokens: %w", err)
			}

			msg := types.MsgRemoveLiquidity{
				Provider:        clientCtx.GetFromAddress().String(),
				PoolId:          poolId,
				LiquidityTokens: &liquidityTokens,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), &msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// CmdSwap returns the command for swapping tokens
func CmdSwap() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "swap [pool-id] [token-in-amount] [token-out-denom] [min-token-out-amount]",
		Short: "Swap tokens in a liquidity pool",
		Args:  cobra.ExactArgs(4),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			poolId, err := strconv.ParseUint(args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid pool ID: %w", err)
			}

			tokenIn, err := sdk.ParseCoinNormalized(args[1])
			if err != nil {
				return fmt.Errorf("invalid token in amount: %w", err)
			}

			tokenOutDenom := args[2]

			minTokenOut, err := sdk.ParseCoinNormalized(args[3])
			if err != nil {
				return fmt.Errorf("invalid min token out amount: %w", err)
			}

			msg := types.MsgSwap{
				Sender:        clientCtx.GetFromAddress().String(),
				PoolId:        poolId,
				TokenIn:       &tokenIn,
				TokenOutDenom: tokenOutDenom,
				MinTokenOut:   &minTokenOut,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), &msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// CmdUpdateParams returns the command for updating module parameters
func CmdUpdateParams() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "update-params [default-fee] [min-liquidity] [max-fee] [min-fee]",
		Short: "Update the module parameters (authority only)",
		Args:  cobra.ExactArgs(4),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}

			minLiquidity, err := strconv.ParseUint(args[1], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid min liquidity: %w", err)
			}

			params := types.Params{
				DefaultFee:   args[0],
				MinLiquidity: minLiquidity,
				MaxFee:       args[2],
				MinFee:       args[3],
			}

			msg := types.MsgUpdateParams{
				Authority: clientCtx.GetFromAddress().String(),
				Params:    &params,
			}

			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), &msg)
		},
	}

	flags.AddTxFlagsToCmd(cmd)
	return cmd
}
