package cli

import (
	"github.com/spf13/cobra"
)

// GetQueryCmd returns the governance module's query commands.
func GetQueryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "gov",
		Short:                      "Governance queries",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       nil,
	}

	cmd.AddCommand(
		CmdQueryParams(),
		CmdQueryProposals(),
		CmdQueryProposal(),
		CmdQueryDeposits(),
		CmdQueryDeposit(),
		CmdQueryVotes(),
		CmdQueryVote(),
		CmdQueryTallyResult(),
	)

	return cmd
}

// CmdQueryParams returns a command to query governance parameters.
func CmdQueryParams() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "params",
		Short: "Query governance parameters",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryProposals returns a command to query all proposals.
func CmdQueryProposals() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "proposals",
		Short: "Query all governance proposals",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryProposal returns a command to query a specific proposal.
func CmdQueryProposal() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "proposal [proposal-id]",
		Short: "Query a specific governance proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryDeposits returns a command to query all deposits for a proposal.
func CmdQueryDeposits() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deposits [proposal-id]",
		Short: "Query all deposits for a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryDeposit returns a command to query a specific deposit.
func CmdQueryDeposit() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deposit [proposal-id] [depositor]",
		Short: "Query a specific deposit",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryVotes returns a command to query all votes for a proposal.
func CmdQueryVotes() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "votes [proposal-id]",
		Short: "Query all votes for a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryVote returns a command to query a specific vote.
func CmdQueryVote() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vote [proposal-id] [voter]",
		Short: "Query a specific vote",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdQueryTallyResult returns a command to query the tally result of a proposal.
func CmdQueryTallyResult() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "tally [proposal-id]",
		Short: "Query the tally result of a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}
