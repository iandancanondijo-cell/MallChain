package types

import "fmt"

// MaxPendingTransfers is the maximum number of pending bridge transfers
// allowed in genesis or at any time. Prevents unbounded memory growth in the
// BridgeState.PendingTransfers slice, which is loaded in full on every
// InitGenesis and held in application state.
const MaxPendingTransfers = 10_000

// DefaultGenesisState returns the default genesis state for the crosschain module.
func DefaultGenesisState() *GenesisState {
	return &GenesisState{
		Params: Params{},
		BridgeState: BridgeState{
			NextTransferId:   1,
			PendingTransfers: []*BridgeTransfer{},
		},
	}
}

// Validate validates the genesis state for the crosschain module.
func (g GenesisState) Validate() error {
	if g.BridgeState.NextTransferId == 0 {
		return fmt.Errorf("next_transfer_id must be greater than 0")
	}

	if g.Params.MinTransferAmount > g.Params.MaxTransferAmount && g.Params.MaxTransferAmount > 0 {
		return fmt.Errorf("min_transfer_amount (%d) exceeds max_transfer_amount (%d)", g.Params.MinTransferAmount, g.Params.MaxTransferAmount)
	}

	if uint64(len(g.BridgeState.PendingTransfers)) > MaxPendingTransfers {
		return fmt.Errorf("pending transfers count (%d) exceeds maximum allowed (%d)",
			len(g.BridgeState.PendingTransfers), MaxPendingTransfers)
	}

	seenIDs := make(map[uint64]bool)
	for _, t := range g.BridgeState.PendingTransfers {
		if t == nil {
			return fmt.Errorf("pending transfer entry is nil")
		}
		if seenIDs[t.Id] {
			return fmt.Errorf("duplicate pending transfer id: %d", t.Id)
		}
		seenIDs[t.Id] = true
	}

	return nil
}
