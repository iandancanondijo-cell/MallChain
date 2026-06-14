package keeper_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/cosmos/cosmos-sdk/types/query"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"marketplace/x/mallpoints/keeper"
	"marketplace/x/mallpoints/types"
)

func createNUserPoints(keeper keeper.Keeper, ctx context.Context, n int) []types.UserPoints {
	items := make([]types.UserPoints, n)
	for i := range items {
		items[i].Index = strconv.Itoa(i)
		items[i].Address = strconv.Itoa(i)
		items[i].Points = uint64(i)
		items[i].TasksCompleted = uint64(i)
		items[i].LastEarned = uint64(i)
		_ = keeper.UserPoints.Set(ctx, items[i].Index, items[i])
	}
	return items
}

func TestUserPointsQuerySingle(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	msgs := createNUserPoints(f.keeper, f.ctx, 2)
	tests := []struct {
		desc     string
		request  *types.QueryGetUserPointsRequest
		response *types.QueryGetUserPointsResponse
		err      error
	}{
		{
			desc: "First",
			request: &types.QueryGetUserPointsRequest{
				Index: msgs[0].Index,
			},
			response: &types.QueryGetUserPointsResponse{UserPoints: msgs[0]},
		},
		{
			desc: "Second",
			request: &types.QueryGetUserPointsRequest{
				Index: msgs[1].Index,
			},
			response: &types.QueryGetUserPointsResponse{UserPoints: msgs[1]},
		},
		{
			desc: "KeyNotFound",
			request: &types.QueryGetUserPointsRequest{
				Index: strconv.Itoa(100000),
			},
			err: status.Error(codes.NotFound, "not found"),
		},
		{
			desc: "InvalidRequest",
			err:  status.Error(codes.InvalidArgument, "invalid request"),
		},
	}
	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			response, err := qs.GetUserPoints(f.ctx, tc.request)
			if tc.err != nil {
				require.ErrorIs(t, err, tc.err)
			} else {
				require.NoError(t, err)
				require.EqualExportedValues(t, tc.response, response)
			}
		})
	}
}

func TestUserPointsQueryPaginated(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	msgs := createNUserPoints(f.keeper, f.ctx, 5)

	request := func(next []byte, offset, limit uint64, total bool) *types.QueryAllUserPointsRequest {
		return &types.QueryAllUserPointsRequest{
			Pagination: &query.PageRequest{
				Key:        next,
				Offset:     offset,
				Limit:      limit,
				CountTotal: total,
			},
		}
	}
	t.Run("ByOffset", func(t *testing.T) {
		step := 2
		for i := 0; i < len(msgs); i += step {
			resp, err := qs.ListUserPoints(f.ctx, request(nil, uint64(i), uint64(step), false))
			require.NoError(t, err)
			require.LessOrEqual(t, len(resp.UserPoints), step)
			require.Subset(t, msgs, resp.UserPoints)
		}
	})
	t.Run("ByKey", func(t *testing.T) {
		step := 2
		var next []byte
		for i := 0; i < len(msgs); i += step {
			resp, err := qs.ListUserPoints(f.ctx, request(next, 0, uint64(step), false))
			require.NoError(t, err)
			require.LessOrEqual(t, len(resp.UserPoints), step)
			require.Subset(t, msgs, resp.UserPoints)
			next = resp.Pagination.NextKey
		}
	})
	t.Run("Total", func(t *testing.T) {
		resp, err := qs.ListUserPoints(f.ctx, request(nil, 0, 0, true))
		require.NoError(t, err)
		require.Equal(t, len(msgs), int(resp.Pagination.Total))
		require.EqualExportedValues(t, msgs, resp.UserPoints)
	})
	t.Run("InvalidRequest", func(t *testing.T) {
		_, err := qs.ListUserPoints(f.ctx, nil)
		require.ErrorIs(t, err, status.Error(codes.InvalidArgument, "invalid request"))
	})
}
