package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/mallpoints/keeper"
	"marketplace/x/mallpoints/types"
)

func TestConversionWindowQuery(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	item := types.ConversionWindow{}
	err := f.keeper.ConversionWindow.Set(f.ctx, item)
	require.NoError(t, err)

	tests := []struct {
		desc     string
		request  *types.QueryGetConversionWindowRequest
		response *types.QueryGetConversionWindowResponse
		err      error
	}{
		{
			desc:     "First",
			request:  &types.QueryGetConversionWindowRequest{},
			response: &types.QueryGetConversionWindowResponse{ConversionWindow: item},
		},
		{
			desc: "InvalidRequest",
			err:  status.Error(codes.InvalidArgument, "invalid request"),
		},
	}
	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			response, err := qs.GetConversionWindow(f.ctx, tc.request)
			if tc.err != nil {
				require.ErrorIs(t, err, tc.err)
			} else {
				require.NoError(t, err)
				require.EqualExportedValues(t, tc.response, response)
			}
		})
	}
}
