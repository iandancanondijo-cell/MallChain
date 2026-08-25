package keeper

import (
	"context"

	"marketplace/x/vault/types"
)

type msgServer struct {
	types.UnimplementedMsgServer
	k *Keeper
}

func NewMsgServerImpl(k *Keeper) types.MsgServer {
	return &msgServer{k: k}
}

func (m *msgServer) SetupVault(ctx context.Context, msg *types.MsgSetupVault) (*types.MsgSetupVaultResponse, error) {
	params := types.Argon2Params{Time: msg.KdfTime, Memory: msg.KdfMemory, Threads: uint8(msg.KdfThreads), KeyLen: msg.KdfKeyLen}
	if err := m.k.SetupVault(ctx, msg.Authority, msg.Salt, params, msg.NonceTotp, msg.EncryptedTotpSecret); err != nil {
		return nil, err
	}
	return &types.MsgSetupVaultResponse{}, nil
}

func (m *msgServer) ConfirmVault(ctx context.Context, msg *types.MsgConfirmVault) (*types.MsgConfirmVaultResponse, error) {
	if err := m.k.ConfirmVault(ctx, msg.Authority, msg.NoncePriv, msg.Ciphertext, msg.PublicKey); err != nil {
		return nil, err
	}
	return &types.MsgConfirmVaultResponse{}, nil
}

func (m *msgServer) DisableVault(ctx context.Context, msg *types.MsgDisableVault) (*types.MsgDisableVaultResponse, error) {
	if err := m.k.DisableVault(ctx, msg.Authority); err != nil {
		return nil, err
	}
	return &types.MsgDisableVaultResponse{}, nil
}

// No-op: embedding UnimplementedMsgServer satisfies the generated interface.
