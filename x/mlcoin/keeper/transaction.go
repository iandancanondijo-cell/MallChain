package keeper

import (
	"context"
	"fmt"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"marketplace/x/mlcoin/types"
)

// RecordTransaction creates and stores a transaction record with a unique ID
func (k Keeper) RecordTransaction(ctx context.Context, from, to string, amount uint64, txType, memo string) (string, error) {
	// Generate unique transaction ID
	nextSeq, err := k.TransactionCount.Next(ctx)
	if err != nil {
		return "", errorsmod.Wrap(err, "failed to get next transaction sequence")
	}

	txID := fmt.Sprintf("TX-%d", nextSeq)

	// Get block height and time from SDK context
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	timestamp := sdkCtx.BlockTime().Unix()

	// Create transaction record
	transaction := types.Transaction{
		TxId:        txID,
		From:        from,
		To:          to,
		Amount:      amount,
		TxType:      txType,
		Timestamp:   timestamp,
		BlockHeight: uint64(blockHeight),
		Memo:        memo,
	}

	// Store transaction
	if err := k.Transactions.Set(ctx, txID, transaction); err != nil {
		return "", errorsmod.Wrap(err, "failed to store transaction")
	}

	return txID, nil
}
