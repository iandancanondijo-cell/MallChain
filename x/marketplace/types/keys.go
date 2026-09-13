package types

import (
	cosmossdkerrors "cosmossdk.io/errors"
)

const (
	ModuleName = "marketplace"

	StoreKey = "marketplace"

	EscrowStateKey      = "escrow/state/"
	EscrowReleasePrefix = "escrow/release/"
	EscrowDisputePrefix = "escrow/dispute/"
	EscrowSeqKey        = 2

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
	ErrInvalidRequest      = cosmossdkerrors.Register(ModuleName, 8, "invalid request")
)

// Escrow is now defined in tx.pb.go, generated from proto/marketplace/marketplace/v1/tx.proto.