package keeper_test

import (
	"strings"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/edu/keeper"
	edutypes "marketplace/x/edu/types"
)

const testUploader = "user-123"

func TestRegisterDocument_FirstVersionHasNoParent(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()
	hash := strings.Repeat("a", 64)

	resp, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: hash,
	})
	require.NoError(t, err)
	require.Equal(t, uint32(1), resp.Version)
	require.NotEmpty(t, resp.RecordId)

	rec, err := f.keeper.DocumentRecord.Get(f.ctx, resp.RecordId)
	require.NoError(t, err)
	require.Equal(t, "doc-1", rec.DocId)
	require.Equal(t, hash, rec.Sha256Hash)
	require.Equal(t, testUploader, rec.Uploader)
	require.Empty(t, rec.ParentRecordId)
}

func TestRegisterDocument_RejectsInvalidCreatorAddress(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	_, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    "not-a-valid-address",
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.Error(t, err)
}

func TestRegisterDocument_RejectsEmptyUploader(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	_, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   "",
		DocId:      "doc-1",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.ErrorIs(t, err, edutypes.ErrInvalidDocument)
}

func TestRegisterDocument_RejectsMalformedHash(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	_, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: "not-a-hash",
	})
	require.ErrorIs(t, err, edutypes.ErrInvalidDocument)
}

func TestRegisterDocument_RejectsEmptyDocID(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	_, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.ErrorIs(t, err, edutypes.ErrInvalidDocument)
}

func TestRegisterDocument_SecondVersionLinksToParentAndIncrementsVersion(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

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
	require.Equal(t, uint32(2), v2.Version)

	rec, err := f.keeper.DocumentRecord.Get(f.ctx, v2.RecordId)
	require.NoError(t, err)
	require.Equal(t, v1.RecordId, rec.ParentRecordId)
}

func TestRegisterDocument_RejectsUnknownParent(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	_, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:        creator,
		Uploader:       testUploader,
		DocId:          "doc-1",
		Sha256Hash:     strings.Repeat("a", 64),
		ParentRecordId: "edu-999",
	})
	require.ErrorIs(t, err, edutypes.ErrParentRecordNotFound)
}

func TestRegisterDocument_RejectsParentFromDifferentDocID(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)

	creator := sdk.AccAddress([]byte("creator_____________")).String()

	v1, err := ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:    creator,
		Uploader:   testUploader,
		DocId:      "doc-1",
		Sha256Hash: strings.Repeat("a", 64),
	})
	require.NoError(t, err)

	_, err = ms.RegisterDocument(f.ctx, &edutypes.MsgRegisterDocument{
		Creator:        creator,
		Uploader:       testUploader,
		DocId:          "doc-2",
		Sha256Hash:     strings.Repeat("b", 64),
		ParentRecordId: v1.RecordId,
	})
	require.ErrorIs(t, err, edutypes.ErrParentRecordNotFound)
}
