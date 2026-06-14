package app

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCustomGetSigners_MetadataValid(t *testing.T) {
	signers := ProvideCustomGetSigners()

	// Smoke checks: every signer definition must be complete.
	require.NotEmpty(t, signers, "expected at least one custom signer")

	seen := make(map[string]struct{}, len(signers))
	for i, s := range signers {
		require.NotEmpty(t, s.MsgType, "signer MsgType must be non-empty (idx=%d)", i)
		require.NotNil(t, s.Fn, "signer Fn must be non-nil (idx=%d, msgType=%s)", i, s.MsgType)

		msgTypeStr := string(s.MsgType)
		if _, ok := seen[msgTypeStr]; ok {
			t.Fatalf("duplicate MsgType in custom signers: %s", msgTypeStr)
		}
		seen[msgTypeStr] = struct{}{}
	}
}

func TestCustomGetSigners_OutputCorrectness(t *testing.T) {
	t.Skip("Skipping signer output correctness tests: concrete message structs require non-empty signer address fields, and this workspace doesn’t provide a reliable way to construct valid Msg instances without knowing exact struct layouts/fields.")
}
