package keeper

import (
	"context"
	"fmt"

	"marketplace/x/mlcoin/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"cosmossdk.io/math"
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

	// Check vesting unlock for founder wallet (5-year period)
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	if wallet.Locked > 0 && wallet.UnlockTime > 0 && sdkCtx.BlockTime().Unix() >= wallet.UnlockTime {
		wallet.Balance += wallet.Locked
		wallet.Locked = 0
		wallet.UnlockTime = 0
		if err := k.Keeper.WalletBalance.Set(ctx, msg.Creator, wallet); err != nil {
			return nil, errorsmod.Wrap(err, "failed to release vested tokens")
		}
	}

	// Calculate transfer fee: 0.0097% of amount (percentage-based)
	// Fee is slashed from recipient's received amount
	amount := math.NewIntFromUint64(msg.Amount)

	// Fee rate: 0.0097% = 0.000097
	// Fee = amount * 0.000097 (minimum 1 base unit to ensure fee always applies)
	// Scaled to avoid floating point: fee = amount * 97 / 10000000 (0.0097%)
	feeRate := math.NewInt(97)   // basis points: 97e-6 = 0.0097%
	feeDenom := math.NewInt(10000000) // 10 million for scaling
	fee := amount.Mul(feeRate).Quo(feeDenom)
	if fee.IsZero() && !amount.IsZero() {
		fee = math.NewInt(1) // minimum fee of 1 base unit
	}

	totalDeduction := amount.Add(fee)
	if wallet.Balance < totalDeduction.Uint64() {
		return nil, errorsmod.Wrap(err, "insufficient balance")
	}

	// Overflow-safe deduction from sender (amount + fee)
	newSenderBalance, err := safeSub(wallet.Balance, totalDeduction.Uint64())
	if err != nil {
		return nil, errorsmod.Wrap(err, "sender balance underflow")
	}
	wallet.Balance = newSenderBalance
	if err := k.Keeper.WalletBalance.Set(ctx, msg.Creator, wallet); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update sender balance")
	}

	// Add to receiver's WalletBalance (create if needed) - only the amount, NOT the fee
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

	// Update transaction fees accumulator
	feesAcc, err := k.Keeper.FeesAccumulated.Get(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to get fees accumulator")
	}
	feesAcc.TransactionFees += fee.Uint64()
	if err := k.Keeper.FeesAccumulated.Set(ctx, feesAcc); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update fees accumulator")
	}

	// Record transaction on blockchain — surface error for observability
	txID, err := k.Keeper.RecordTransaction(ctx, msg.Creator, msg.To, msg.Amount, "transfer", "P2P transfer")
	if err != nil {
		sdkCtx.Logger().Info("transfer recording failed (transfer succeeded)", "from", msg.Creator, "to", msg.To, "error", err)
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeTransfer,
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
		sdk.NewAttribute(types.AttributeKeyFrom, msg.Creator),
		sdk.NewAttribute(types.AttributeKeyTo, msg.To),
		sdk.NewAttribute(types.AttributeKeyAmount, fmt.Sprintf("%d", amount)),
		sdk.NewAttribute(types.AttributeKeyFee, fmt.Sprintf("%d", fee)),
		sdk.NewAttribute(types.AttributeKeyTxID, txID),
	))

	return &types.MsgTransferMallcoinResponse{TxId: txID}, nil
}