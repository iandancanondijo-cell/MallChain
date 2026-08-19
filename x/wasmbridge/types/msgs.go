package types

const (
	ActionTransfer     = "transfer"
	ActionApprove      = "approve"
	ActionTransferFrom = "transfer_from"
)

// MGP20TransferMsg, MGP20ApproveMsg, and MGP20TransferFromMsg are the
// JSON-encoded action payloads carried in MsgExecuteAction.Message,
// dispatched by MsgExecuteAction.Action. They are plain JSON, not proto
// messages, since they're opaque to the outer Msg service.

type MGP20TransferMsg struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Amount uint64 `json:"amount"`
}

type MGP20ApproveMsg struct {
	Owner   string `json:"owner"`
	Spender string `json:"spender"`
	Amount  uint64 `json:"amount"`
}

type MGP20TransferFromMsg struct {
	Owner     string `json:"owner"`
	Spender   string `json:"spender"`
	Recipient string `json:"recipient"`
	Amount    uint64 `json:"amount"`
}
