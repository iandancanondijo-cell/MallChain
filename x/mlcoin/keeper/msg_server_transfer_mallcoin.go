package keeper

import (
	"context"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) TransferMallcoin(ctx context.Context, msg *types.MsgTransferMallcoin) (*types.MsgTransferMallcoinResponse, error) {
	// Validate Bech32 addresses
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid sender address")
	}

	if _, err := k.addressCodec.StringToBytes(msg.To); err != nil {
		return nil, errorsmod.Wrap(err, "invalid recipient address")
	}

	// Signature verification and sequence checking are performed by the
	// standard Cosmos SDK ante handler (ADR-036). Here we simply perform
	// the application-level transfer.

	// Check sender balance in WalletBalance (consistent with buy/sell)
	wallet, err := k.Keeper.WalletBalance.Get(ctx, msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(err, "sender wallet not found")
	}
	if wallet.Balance < msg.Amount {
		return nil, errorsmod.Wrap(err, "insufficient balance")
	}

	// Overflow-safe deduction from sender
	newSenderBalance, err := safeSub(wallet.Balance, msg.Amount)
	if err != nil {
		return nil, errorsmod.Wrap(err, "sender balance underflow")
	}
	wallet.Balance = newSenderBalance
	if err := k.Keeper.WalletBalance.Set(ctx, msg.Creator, wallet); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update sender balance")
	}

	// Add to receiver's WalletBalance (create if needed)
	receiverWallet, err := k.Keeper.WalletBalance.Get(ctx, msg.To)
	if err != nil {
		receiverWallet = types.WalletBalance{Address: msg.To, Balance: 0}
	}
	newReceiverBalance, err := safeAdd(receiverWallet.Balance, msg.Amount)
	if err != nil {
		return nil, errorsmod.Wrap(err, "receiver balance overflow")
	}
	receiverWallet.Balance = newReceiverBalance
	if err := k.Keeper.WalletBalance.Set(ctx, msg.To, receiverWallet); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update receiver balance")
	}

	// Record transaction on blockchain — surface error for observability
	txID, err := k.Keeper.RecordTransaction(ctx, msg.Creator, msg.To, msg.Amount, "transfer", "P2P transfer")
	if err != nil {
		sdkCtx := sdk.UnwrapSDKContext(ctx)
		sdkCtx.Logger().Info("transfer recording failed (transfer succeeded)", "from", msg.Creator, "to", msg.To, "error", err)
	}

	return &types.MsgTransferMallcoinResponse{TxId: txID}, nil
}
