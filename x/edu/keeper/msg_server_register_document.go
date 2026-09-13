package keeper

import (
	"context"
	"encoding/hex"
	"fmt"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"marketplace/x/edu/types"
)

func (k msgServer) RegisterDocument(ctx context.Context, msg *types.MsgRegisterDocument) (*types.MsgRegisterDocumentResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	if msg.Uploader == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidDocument, "uploader cannot be empty")
	}

	if msg.DocId == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidDocument, "doc_id cannot be empty")
	}

	if len(msg.Sha256Hash) != 64 {
		return nil, errorsmod.Wrap(types.ErrInvalidDocument, "sha256_hash must be a 64-character hex-encoded string")
	}
	if _, err := hex.DecodeString(msg.Sha256Hash); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidDocument, "sha256_hash must be valid hex")
	}

	// A document's first version has no parent. Every later version must
	// link back to the immediately preceding record for the SAME doc_id,
	// which is what turns this into a verifiable provenance chain rather
	// than a flat, unordered list of hashes.
	version := uint32(1)
	if msg.ParentRecordId != "" {
		parent, err := k.Keeper.DocumentRecord.Get(ctx, msg.ParentRecordId)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrParentRecordNotFound, "parent_record_id does not exist")
		}
		if parent.DocId != msg.DocId {
			return nil, errorsmod.Wrap(types.ErrParentRecordNotFound, "parent_record_id belongs to a different doc_id")
		}
		version = parent.Version + 1
	}

	seq, err := k.Keeper.RecordSeq.Next(ctx)
	if err != nil {
		return nil, err
	}
	recordID := fmt.Sprintf("%s-%d", types.ModuleName, seq+1)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	record := types.DocumentRecord{
		RecordId:       recordID,
		DocId:          msg.DocId,
		Sha256Hash:     msg.Sha256Hash,
		Version:        version,
		Uploader:       msg.Uploader,
		ParentRecordId: msg.ParentRecordId,
		Timestamp:      sdkCtx.BlockTime().Unix(),
	}

	if err := k.Keeper.DocumentRecord.Set(ctx, recordID, record); err != nil {
		return nil, err
	}
	if err := k.Keeper.DocVersionIndex.Set(ctx, collections.Join(msg.DocId, version), recordID); err != nil {
		return nil, err
	}

	return &types.MsgRegisterDocumentResponse{RecordId: recordID, Version: version}, nil
}
