package types

import (
	"github.com/cosmos/gogoproto/proto"
)

// ChainRoute maps a logical destination chain name to IBC routing metadata.
type ChainRoute struct {
	ChainID   string `json:"chain_id"`
	ChannelID string `json:"channel_id"`
	PortID    string `json:"port_id"`
}

func (m *ChainRoute) Reset()         { *m = ChainRoute{} }
func (m *ChainRoute) String() string { return proto.CompactTextString(m) }
func (*ChainRoute) ProtoMessage()    {}

// DefaultPortID is the standard IBC transfer port.
const DefaultPortID = "transfer"

// TransferMeta stores block-level metadata for a bridge transfer.
type TransferMeta struct {
	InitHeight    uint64 `json:"init_height"`
	IBCSequence   uint64 `json:"ibc_sequence,omitempty"`
	TimeoutBlocks uint64 `json:"timeout_blocks"`
}

func (m *TransferMeta) Reset()         { *m = TransferMeta{} }
func (m *TransferMeta) String() string { return proto.CompactTextString(m) }
func (*TransferMeta) ProtoMessage()    {}
