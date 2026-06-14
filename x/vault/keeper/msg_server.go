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
	uri, err := m.k.SetupVault(ctx, msg.Password, msg.Account, msg.Issuer)
	if err != nil {
		return nil, err
	}
	return &types.MsgSetupVaultResponse{ProvisioningUri: uri}, nil
}

func (m *msgServer) ConfirmVault(ctx context.Context, msg *types.MsgConfirmVault) (*types.MsgConfirmVaultResponse, error) {
	if err := m.k.ConfirmVault(ctx, msg.Password, msg.TotpCode, msg.PrivKey); err != nil {
		return nil, err
	}
	return &types.MsgConfirmVaultResponse{}, nil
}

func (m *msgServer) UnlockAndSign(ctx context.Context, msg *types.MsgUnlockAndSign) (*types.MsgUnlockAndSignResponse, error) {
	sig, err := m.k.UnlockAndSign(ctx, msg.Password, msg.TotpCode, msg.Message)
	if err != nil {
		return nil, err
	}
	return &types.MsgUnlockAndSignResponse{Signature: sig}, nil
}

func (m *msgServer) DisableVault(ctx context.Context, msg *types.MsgDisableVault) (*types.MsgDisableVaultResponse, error) {
	if err := m.k.DisableVault(ctx, msg.Password, msg.TotpCode); err != nil {
		return nil, err
	}
	return &types.MsgDisableVaultResponse{}, nil
}

// No-op: embedding UnimplementedMsgServer satisfies the generated interface.
