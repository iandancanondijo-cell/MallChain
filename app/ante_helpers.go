package app

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"

	"github.com/cosmos/cosmos-sdk/types"

	storetypes "cosmossdk.io/store/types"
)

// Dedicated key layout used by ante wrapper.
// Keep these constants centralized for correctness + tests.
var (
	anteRLCountKey     = []byte("ante:rl:count") // 16 bytes total in value (height|count)
	anteReplayPrefix   = []byte("ante:replay:")  // replay keys: ante:replay:<txhash> -> value (height uint64)
	anteReplayValBytes = 8
)

// replayDecision returns whether the tx hash has already been seen.
// It also returns the replayKey used so caller can mark it as seen if allowed.
func replayDecision(txBytes []byte, store storetypes.KVStore, _ uint64) (replayKey []byte, alreadySeen bool) {
	h := sha256.Sum256(txBytes)
	replayKey = append(anteReplayPrefix, h[:]...)

	return replayKey, store.Has(replayKey)
}

// pruneReplayKeys prunes replay keys whose stored height is older than pruneBefore.
// pruneBefore is an absolute height; any entry with seenH < pruneBefore is deleted.
func pruneReplayKeys(store storetypes.KVStore, pruneBefore uint64) error {
	if pruneBefore == 0 {
		// Nothing to prune when pruneBefore==0 (matches current wrapper behavior).
		return nil
	}

	// Safe two-pass deletion:
	// 1) collect keys to delete
	// 2) delete after iteration completes
	var toDelete [][]byte
	iter := storetypes.KVStorePrefixIterator(store, anteReplayPrefix)
	for ; iter.Valid(); iter.Next() {
		k := iter.Key()
		v := iter.Value()
		if len(v) != anteReplayValBytes {
			continue
		}
		seenH := binary.BigEndian.Uint64(v)
		if seenH < pruneBefore {
			keyCopy := make([]byte, len(k))
			copy(keyCopy, k)
			toDelete = append(toDelete, keyCopy)
		}
	}
	_ = iter.Close()

	for _, k := range toDelete {
		store.Delete(k)
	}
	return nil
}

// updateRateLimitCounter enforces the current ante wrapper behavior:
// - a single counter per-block (global), stored as 16-byte value: storedHeight|count.
// - count resets whenever storedHeight < curH.
func updateRateLimitCounter(store storetypes.KVStore, curH uint64, perBlockLimit uint64) (allowed bool, newCount uint64, err error) {
	// Read stored value: [storedHeight(8) | count(8)]
	val := store.Get(anteRLCountKey)

	var storedHeight uint64
	var count uint64
	if val != nil && len(val) == 16 {
		storedHeight = binary.BigEndian.Uint64(val[:8])
		count = binary.BigEndian.Uint64(val[8:16])
	}

	if storedHeight < curH {
		storedHeight = curH
		count = 1
	} else {
		count++
	}

	if count > perBlockLimit {
		return false, count, nil
	}

	buf := make([]byte, 16)
	binary.BigEndian.PutUint64(buf[:8], storedHeight)
	binary.BigEndian.PutUint64(buf[8:16], count)
	store.Set(anteRLCountKey, buf)

	return true, count, nil
}

// markReplaySeen stores a replay key with the current height as value.
func markReplaySeen(store storetypes.KVStore, replayKey []byte, curH uint64) error {
	heightBuf := make([]byte, anteReplayValBytes)
	binary.BigEndian.PutUint64(heightBuf, curH)
	store.Set(replayKey, heightBuf)
	return nil
}

// txAuditRejectEvent creates the tx_audit event emitted on ante rejections.
func txAuditRejectEvent(rejectReason string, curH uint64) types.Event {
	return types.NewEvent(
		"tx_audit",
		types.NewAttribute("reject_reason", rejectReason),
		types.NewAttribute("height", fmt.Sprintf("%d", curH)),
	)
}

// txAuditEvent creates the tx_audit event emitted for every tx in the wrapper.
func txAuditEvent(numMsgs int, simulate bool, curH uint64) types.Event {
	return types.NewEvent(
		"tx_audit",
		types.NewAttribute("num_msgs", fmt.Sprintf("%d", numMsgs)),
		types.NewAttribute("simulate", fmt.Sprintf("%t", simulate)),
		types.NewAttribute("height", fmt.Sprintf("%d", curH)),
	)
}

type replayEntry struct {
	// keySuffix is the suffix part for easier testing (the part after anteReplayPrefix).
	// In production, the full KV key is composed as anteReplayPrefix + sha256(txBytes).
	keySuffix  []byte
	seenHeight uint64
}

// pruneReplayEntries is a pure helper used by unit tests to validate pruning-by-height semantics.
// Production code still prunes via KVStorePrefixIterator in pruneReplayKeys.
func pruneReplayEntries(entries []replayEntry, pruneBefore uint64) []replayEntry {
	if pruneBefore == 0 {
		return nil
	}

	var toDelete []replayEntry
	for _, e := range entries {
		if e.seenHeight < pruneBefore {
			toDelete = append(toDelete, e)
		}
	}
	return toDelete
}

// NOTE: The above helper functions assume the store supports Has/Get/Set/Delete with the usual KV semantics.
// They are written so we can unit-test the ante logic in isolation from auth ante.
