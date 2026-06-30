package types

import "fmt"

// BridgeMemoPrefix identifies outbound bridge transfers in IBC packet memos.
const BridgeMemoPrefix = "crosschain:"

// FormatBridgeMemo encodes a transfer id into an IBC memo.
func FormatBridgeMemo(transferID uint64) string {
	return fmt.Sprintf("%s%d", BridgeMemoPrefix, transferID)
}

// ParseBridgeMemo extracts a transfer id from an IBC memo, if present.
func ParseBridgeMemo(memo string) (uint64, bool) {
	if len(memo) <= len(BridgeMemoPrefix) {
		return 0, false
	}
	if memo[:len(BridgeMemoPrefix)] != BridgeMemoPrefix {
		return 0, false
	}
	var id uint64
	if _, err := fmt.Sscanf(memo, BridgeMemoPrefix+"%d", &id); err != nil {
		return 0, false
	}
	return id, true
}
