package types

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	ActionTransfer     = "transfer"
	ActionApprove      = "approve"
	ActionTransferFrom = "transfer_from"
)

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

type QueryBalanceRequest struct {
	Address string `json:"address"`
}

type QueryBalanceResponse struct {
	Balance uint64 `json:"balance"`
}

type QueryAllowanceRequest struct {
	Owner   string `json:"owner"`
	Spender string `json:"spender"`
}

type QueryAllowanceResponse struct {
	Allowance uint64 `json:"allowance"`
}

type MsgExecuteContract struct {
	Sender   string `json:"sender"`
	Contract string `json:"contract"`
	Action   string `json:"action"`
	Message  []byte `json:"message"`
}

func (m *MsgExecuteContract) ValidateBasic() error {
	if m.Sender == "" {
		return ErrInvalidRequest
	}
	if m.Action == "" {
		return ErrInvalidRequest
	}
	return nil
}

func (m *MsgExecuteContract) GetSigners() []sdk.AccAddress {
	sender, _ := sdk.AccAddressFromBech32(m.Sender)
	return []sdk.AccAddress{sender}
}

type MsgExecuteContractResponse struct {
	Success bool `json:"success"`
}

type MsgServer interface {
	ExecuteContract(context.Context, *MsgExecuteContract) (*MsgExecuteContractResponse, error)
}

type QueryServer interface {
	Balance(context.Context, *QueryBalanceRequest) (*QueryBalanceResponse, error)
	Allowance(context.Context, *QueryAllowanceRequest) (*QueryAllowanceResponse, error)
}

func RegisterMsgServer(_ interface{}, _ MsgServer) {}
func RegisterQueryServer(_ interface{}, _ QueryServer) {}