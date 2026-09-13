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

// TransferMeta stores block-level metadata for a bridge transfer. The
// IBCSequence/TimeoutTimestamp/PortID/ChannelID fields are only populated
// when a real outbound IBC packet was actually sent (see
// keeper.sendOutboundIBCTransfer) — they're what lets
// keeper.verifyTransferProof reconstruct the exact packet commitment that
// must be proven, rather than trusting a caller-supplied value. A transfer
// with IBCSequence == 0 never had a real packet sent for it (no chain route
// was configured), so no legitimate proof can exist for it either.
type TransferMeta struct {
	InitHeight       uint64 `json:"init_height"`
	IBCSequence      uint64 `json:"ibc_sequence,omitempty"`
	TimeoutBlocks    uint64 `json:"timeout_blocks"`
	TimeoutTimestamp uint64 `json:"timeout_timestamp,omitempty"`
	PortID           string `json:"port_id,omitempty"`
	ChannelID        string `json:"channel_id,omitempty"`
}

func (m *TransferMeta) Reset()         { *m = TransferMeta{} }
func (m *TransferMeta) String() string { return proto.CompactTextString(m) }
func (*TransferMeta) ProtoMessage()    {}
