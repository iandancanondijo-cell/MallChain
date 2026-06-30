package types

import (
	cosmossdkerrors "cosmossdk.io/errors"
	"github.com/cosmos/gogoproto/proto"
)

const (
	ModuleName = "marketplace"

	StoreKey = "marketplace"

	EscrowStateKey      = "escrow/state/"
	EscrowReleasePrefix = "escrow/release/"
	EscrowDisputePrefix = "escrow/dispute/"

	// Escrow status
	StatusPending  = "pending"
	StatusHeld     = "held"
	StatusReleased = "released"
	StatusDisputed = "disputed"
	StatusRefunded = "refunded"
)

var (
	ErrEscrowNotFound      = cosmossdkerrors.Register(ModuleName, 1, "escrow not found")
	ErrInvalidAmount       = cosmossdkerrors.Register(ModuleName, 2, "invalid amount")
	ErrInvalidStatus       = cosmossdkerrors.Register(ModuleName, 3, "invalid status transition")
	ErrUnauthorized        = cosmossdkerrors.Register(ModuleName, 4, "unauthorized")
	ErrAlreadyResolved     = cosmossdkerrors.Register(ModuleName, 5, "escrow already resolved")
	ErrDisputePeriodPassed = cosmossdkerrors.Register(ModuleName, 6, "dispute period has passed")
	ErrInsufficientBalance = cosmossdkerrors.Register(ModuleName, 7, "insufficient balance")
)

type Escrow struct {
	ID string `protobuf:"bytes,1,opt,name=id,proto3" json:"id"`
	Buyer string `protobuf:"bytes,2,opt,name=buyer,proto3" json:"buyer"`
	Seller string `protobuf:"bytes,3,opt,name=seller,proto3" json:"seller"`
	Amount string `protobuf:"bytes,4,opt,name=amount,proto3" json:"amount"`
	Denom string `protobuf:"bytes,5,opt,name=denom,proto3" json:"denom"`
	Description string `protobuf:"bytes,6,opt,name=description,proto3" json:"description"`
	Status string `protobuf:"bytes,7,opt,name=status,proto3" json:"status"`
	LockedFunds string `protobuf:"bytes,8,opt,name=locked_funds,json=lockedFunds,proto3" json:"locked_funds"`
	CreatedAt int64 `protobuf:"varint,9,opt,name=created_at,json=createdAt,proto3" json:"created_at"`
	ReleaseTime int64 `protobuf:"varint,10,opt,name=release_time,json=releaseTime,proto3" json:"release_time"`
	DisputeWindow int64 `protobuf:"varint,11,opt,name=dispute_window,json=disputeWindow,proto3" json:"dispute_window"`
}

func (m *Escrow) Reset()         { *m = Escrow{} }
func (m *Escrow) String() string { return proto.CompactTextString(m) }
func (*Escrow) ProtoMessage()    {}