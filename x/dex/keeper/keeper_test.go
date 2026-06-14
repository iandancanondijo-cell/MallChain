package keeper

import (
	"math/big"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func TestIntegerSqrt(t *testing.T) {
	tests := []struct {
		name     string
		value    math.Int
		expected math.Int
	}{
		{"zero", math.ZeroInt(), math.ZeroInt()},
		{"one", math.NewInt(1), math.NewInt(1)},
		{"two", math.NewInt(2), math.NewInt(1)},
		{"four", math.NewInt(4), math.NewInt(2)},
		{"fifteen", math.NewInt(15), math.NewInt(3)},
		{"sixteen", math.NewInt(16), math.NewInt(4)},
		{"large", math.NewInt(1234567890123456789), math.NewIntFromBigInt(new(big.Int).Sqrt(math.NewInt(1234567890123456789).BigInt()))},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := integerSqrt(tt.value)
			if !result.Equal(tt.expected) {
				t.Fatalf("expected %s, got %s", tt.expected.String(), result.String())
			}
		})
	}
}

func TestParseFeeDec(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"default", "", "0.003"},
		{"custom", "0.005", "0.005"},
		{"invalid", "not-a-fee", "0.003"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseFeeDec(tt.input)
			expected, err := math.LegacyNewDecFromStr(tt.expected)
			if err != nil {
				t.Fatal(err)
			}
			if !result.Equal(expected) {
				t.Fatalf("expected %s, got %s", expected.String(), result.String())
			}
		})
	}
}

func TestCalculateSwapFeePrecision(t *testing.T) {
	keeper := Keeper{}
	tokenIn := sdk.NewCoin("tokenA", math.NewInt(1000))
	reserveIn := sdk.NewCoin("tokenA", math.NewInt(10000))
	reserveOut := sdk.NewCoin("tokenB", math.NewInt(20000))

	result := keeper.calculateSwap(tokenIn, reserveIn, reserveOut, "0.003", 50)
	if result.Amount.LTE(math.ZeroInt()) {
		t.Fatalf("expected positive amount out, got %s", result.Amount.String())
	}

	result2 := keeper.calculateSwap(tokenIn, reserveIn, reserveOut, "0.005", 50)
	if result2.Amount.GTE(result.Amount) {
		t.Fatalf("expected higher fee to produce smaller output: %s >= %s", result2.Amount.String(), result.Amount.String())
	}
}
