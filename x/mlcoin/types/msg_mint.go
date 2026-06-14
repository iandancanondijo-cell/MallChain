//go:build ignore
// +build ignore

package types

// This file contains manual types that duplicate generated protobuf types.
// It is excluded from normal builds via the //go:build ignore tag so the
// protoc-generated `tx.pb.go` definitions are used instead.

// MsgMintMallcoin defines a request to mint Mallcoin to a recipient by authority.
type MsgMintMallcoin struct {
	Authority string `json:"authority"`
	Recipient string `json:"recipient"`
	Amount    uint64 `json:"amount"`
}

type MsgMintMallcoinResponse struct {
	TxId string `json:"tx_id"`
}
