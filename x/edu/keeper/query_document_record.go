package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/edu/types"
)

func (q queryServer) GetDocumentRecord(ctx context.Context, req *types.QueryGetDocumentRecordRequest) (*types.QueryGetDocumentRecordResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	val, err := q.k.DocumentRecord.Get(ctx, req.RecordId)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, status.Error(codes.NotFound, "not found")
		}
		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetDocumentRecordResponse{Record: val}, nil
}

// GetVersionHistory walks the (doc_id, version) index in ascending version
// order, so the returned list is oldest-first — the same order a reader
// would want when reconstructing "how did this document evolve".
func (q queryServer) GetVersionHistory(ctx context.Context, req *types.QueryGetVersionHistoryRequest) (*types.QueryGetVersionHistoryResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	rng := collections.NewPrefixedPairRange[string, uint32](req.DocId)

	var records []types.DocumentRecord
	err := q.k.DocVersionIndex.Walk(ctx, rng, func(_ collections.Pair[string, uint32], recordID string) (bool, error) {
		rec, err := q.k.DocumentRecord.Get(ctx, recordID)
		if err != nil {
			return false, err
		}
		records = append(records, rec)
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "internal error")
	}

	return &types.QueryGetVersionHistoryResponse{Records: records}, nil
}
