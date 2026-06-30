package types

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/baseapp"
)

// MessageRouter executes sdk.Msg handlers registered on the application.
type MessageRouter interface {
	Handler(msg sdk.Msg) baseapp.MsgServiceHandler
}
