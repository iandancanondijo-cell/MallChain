package keeper

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/vault/types"
)

var _ types.QueryServer = queryServer{}

// NewQueryServerImpl returns an implementation of the QueryServer interface
// for the provided Keeper.
func NewQueryServerImpl(k *Keeper) types.QueryServer {
	return queryServer{k}
}

type queryServer struct {
	k *Keeper
}

// VaultBlob returns owner's encrypted vault record so the client can derive
// its Argon2id key and decrypt locally. This is a read-only query, not a
// Msg — it isn't broadcast or written to chain history, so returning
// ciphertext already sitting in public chain state doesn't expose anything
// new.
func (q queryServer) VaultBlob(ctx context.Context, req *types.QueryVaultBlobRequest) (*types.QueryVaultBlobResponse, error) {
	if req == nil || req.Owner == "" {
		return nil, status.Error(codes.InvalidArgument, "owner is required")
	}

	vb, err := q.k.GetVaultBlob(ctx, req.Owner)
	if err != nil {
		return nil, status.Error(codes.Internal, "internal error")
	}
	if vb == nil {
		return &types.QueryVaultBlobResponse{Found: false}, nil
	}

	return &types.QueryVaultBlobResponse{
		Found:               true,
		Salt:                vb.Salt,
		KdfTime:             vb.Params.Time,
		KdfMemory:           vb.Params.Memory,
		KdfThreads:          uint32(vb.Params.Threads),
		KdfKeyLen:           vb.Params.KeyLen,
		NonceTotp:           vb.NonceTOTP,
		EncryptedTotpSecret: vb.EncryptedTOTPSecret,
		NoncePriv:           vb.NoncePriv,
		Ciphertext:          vb.Ciphertext,
		PublicKey:           vb.PublicKey,
	}, nil
}
