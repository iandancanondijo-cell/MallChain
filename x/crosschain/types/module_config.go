package types

import proto "github.com/cosmos/gogoproto/proto"

// Module is the config object for the crosschain module.
type Module struct{}

func (m *Module) Reset()         { *m = Module{} }
func (m *Module) String() string { return proto.CompactTextString(m) }
func (*Module) ProtoMessage()    {}
