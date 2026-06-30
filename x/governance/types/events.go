package types

const (
	EventTypeProposalSubmitted = "proposal_submitted"
	EventTypeProposalDeposit   = "proposal_deposit"
	EventTypeProposalVote      = "proposal_vote"
	EventTypeProposalPassed    = "proposal_passed"
	EventTypeProposalRejected  = "proposal_rejected"
	EventTypeProposalFailed    = "proposal_failed"
	EventTypeProposalExecuted  = "proposal_executed"
	EventTypeProposalExecFail  = "proposal_execution_failed"
	EventTypeDepositRefunded   = "deposit_refunded"
	EventTypeDepositRefundFail = "deposit_refund_failed"
	EventTypeParamsUpdated     = "governance_params_updated"

	AttributeKeyProposalID = "proposal_id"
	AttributeKeyProposer   = "proposer"
	AttributeKeyVoter      = "voter"
	AttributeKeyDepositor    = "depositor"
	AttributeKeyAmount     = "amount"
	AttributeKeyStatus     = "status"
	AttributeKeyTitle      = "title"
	AttributeKeyMsgCount   = "message_count"
	AttributeKeyError      = "error"
)
