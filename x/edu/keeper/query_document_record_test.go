package keeper_test

import (
	"strings"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/edu/keeper"
	edutypes "marketplace/x/edu/types"
)

func TestGetDocumentRecord(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()
	created, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.NoError(t, err)

	resp, err := qs.GetDocumentRecord(f.ctx, &edutypes.QueryGetDocumentRecordRequest{RecordId: created.RecordId})
	require.NoError(t, err)
	require.Equal(t, "doc-1", resp.Record.DocId)

	_, err = qs.GetDocumentRecord(f.ctx, &edutypes.QueryGetDocumentRecordRequest{RecordId: "does-not-exist"})
	require.ErrorIs(t, err, status.Error(codes.NotFound, "not found"))

	_, err = qs.GetDocumentRecord(f.ctx, nil)
	require.ErrorIs(t, err, status.Error(codes.InvalidArgument, "invalid request"))
}

// GetVersionHistory must return every version of a doc_id oldest-first,
// reconstructing the provenance chain independent of registration order
// within a version (each call links to the previous via ParentRecordId).
func TestGetVersionHistory_ReturnsOldestFirst(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	qs := keeper.NewQueryServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	v1, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.NoError(t, err)

	v2, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:        creator,
		Uploader:       testUploader,
		DocId:          "doc-1",
		Sha256Hash:     strings.Repeat("b", 64),
		ParentRecordId: v1.RecordId,
	})
	require.NoError(t, err)

	v3, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:        creator,
		Uploader:       testUploader,
		DocId:          "doc-1",
		Sha256Hash:     strings.Repeat("c", 64),
		ParentRecordId: v2.RecordId,
	})
	require.NoError(t, err)

	// A second, unrelated doc_id must not leak into doc-1's history.
	_, err = ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-2",
		Sha256Hash: strings.Repeat("d", 64),
	})
	require.NoError(t, err)

	resp, err := qs.GetVersionHistory(f.ctx, &edutypes.QueryGetVersionHistoryRequest{DocId: "doc-1"})
	require.NoError(t, err)
	require.Len(t, resp.Records, 3)
	require.Equal(t, uint32(1), resp.Records[0].Version)
	require.Equal(t, uint32(2), resp.Records[1].Version)
	require.Equal(t, uint32(3), resp.Records[2].Version)
	require.Equal(t, v1.RecordId, resp.Records[0].RecordId)
	require.Equal(t, v3.RecordId, resp.Records[2].RecordId)
}
