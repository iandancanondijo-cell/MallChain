package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/types"
)

func TestMintGuard(t *testing.T) {
	f := initFixture(t)

	// initialize emission state so minting can proceed
	em := types.EmissionState{
		TotalSupply: 1000000,
		Circulating: 0,
		DailyLimit:  1000,
	}
	if err := f.keeper.EmissionState.Set(f.ctx, em); err != nil {
		t.Fatalf("failed to set emission state: %v", err)
	}

	// attempt to mint without enabling internal minting
	err := f.keeper.MintToWallet(f.ctx, "someaddr", 100)
	require.Error(t, err)

	// enable minting and succeed
	err = f.keeper.WithMintingEnabled(f.ctx, func() error {
		return f.keeper.MintToWallet(f.ctx, "someaddr", 100)
	})
	require.NoError(t, err)

	// ensure wallet balance set
	wb, err := f.keeper.WalletBalance.Get(f.ctx, "someaddr")
	require.NoError(t, err)
	require.Equal(t, uint64(100), wb.Balance)
}
