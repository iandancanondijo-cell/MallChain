package cli

import (
	"github.com/spf13/cobra"
)

// GetTxCmd returns the governance module's transaction commands.
func GetTxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "governance",
		Short:                      "Governance module transactions",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       nil,
	}

	cmd.AddCommand(
		CmdSubmitProposal(),
		CmdVote(),
		CmdVoteWeighted(),
		CmdDeposit(),
	)

	return cmd
}

// CmdSubmitProposal returns a command to submit a proposal.
func CmdSubmitProposal() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "submit-proposal",
		Short: "Submit a governance proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdVote returns a command to vote on a proposal.
func CmdVote() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vote",
		Short: "Vote on a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdVoteWeighted returns a command to vote with weighted options.
func CmdVoteWeighted() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vote-weighted",
		Short: "Vote with weighted options on a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}

// CmdDeposit returns a command to deposit on a proposal.
func CmdDeposit() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deposit",
		Short: "Deposit on a proposal",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	return cmd
}
