package app

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProvideCustomGetSigners_RuntimeAssertions_Metadata(t *testing.T) {
	signers := ProvideCustomGetSigners()
	require.NotEmpty(t, signers)

	for i, s := range signers {
		require.NotEmpty(t, s.MsgType, "expected non-empty MsgType (idx=%d)", i)
		require.NotNil(t, s.Fn, "expected non-nil Fn (idx=%d, msgType=%s)", i, s.MsgType)
	}
}
