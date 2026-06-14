package app

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPruneReplayEntriesByHeight(t *testing.T) {
	entries := []replayEntry{
		{keySuffix: []byte("a"), seenHeight: 1},
		{keySuffix: []byte("b"), seenHeight: 2},
		{keySuffix: []byte("c"), seenHeight: 3},
	}

	// pruneBefore=2 => delete entries with seenHeight < 2 => only "a"
	toDelete := pruneReplayEntries(entries, 2)
	require.Equal(t, 1, len(toDelete))
	require.Equal(t, "a", string(toDelete[0].keySuffix))

	// pruneBefore=3 => delete "a"(1) and "b"(2)
	toDelete = pruneReplayEntries(entries, 3)
	require.Equal(t, 2, len(toDelete))
	require.Equal(t, "a", string(toDelete[0].keySuffix))
	require.Equal(t, "b", string(toDelete[1].keySuffix))

	// pruneBefore=0 => delete nothing (matches current wrapper behavior)
	toDelete = pruneReplayEntries(entries, 0)
	require.Empty(t, toDelete)
}
