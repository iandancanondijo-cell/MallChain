package keeper_test

import (
	"reflect"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"marketplace/x/mlcoin/keeper"
	"marketplace/x/mlcoin/types"
)

func TestSetCurrencyRateGating(t *testing.T) {
	f := initFixture(t)

	srv := keeper.NewMsgServerImpl(&f.keeper)
	rv := reflect.ValueOf(srv)
	m := rv.MethodByName("SetCurrencyRate")
	require.True(t, m.IsValid(), "SetCurrencyRate method should exist on msg server")

	// wrap SDK context for msg server
	sdkCtx := f.ctx.(sdk.Context)
	wrapped := sdk.WrapSDKContext(sdkCtx)

	in := &types.MsgSetCurrencyRate{Authority: "bad", Currency: "USD", RateToKes: 100}
	out := m.Call([]reflect.Value{reflect.ValueOf(wrapped), reflect.ValueOf(in)})
	require.NotNil(t, out[1].Interface())

	authStr, _ := f.addressCodec.BytesToString(f.keeper.GetAuthority())
	in2 := &types.MsgSetCurrencyRate{Authority: authStr, Currency: "USD", RateToKes: 12345}
	out2 := m.Call([]reflect.Value{reflect.ValueOf(wrapped), reflect.ValueOf(in2)})
	require.Nil(t, out2[1].Interface())

	cr, err := f.keeper.CurrencyRates.Get(f.ctx, "USD")
	require.NoError(t, err)
	require.Equal(t, uint64(12345), cr.RateToKes)
}
