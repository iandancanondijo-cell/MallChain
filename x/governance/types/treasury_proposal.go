package types

// TreasuryProposal defines the structure of a proposal to allocate funds from the treasury for a specific purpose. It includes details about the proposal, such as the title, description, recipient, amount, and voting results.
type TreasuryProposal struct {
	Title       string
	Description string
	Recipient   string
	Amount      uint64
	VotesYes    uint64
	VotesNo     uint64
	Executed    bool
}
