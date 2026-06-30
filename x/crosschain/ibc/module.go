package ibc

import (
	"fmt"
	"strings"

	sdk "github.com/cosmos/cosmos-sdk/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v10/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"

	"marketplace/x/crosschain/keeper"
)

var _ porttypes.IBCModule = IBCModule{}

// IBCModule wraps the ICS-20 transfer module to observe inbound bridge packets.
type IBCModule struct {
	keeper keeper.Keeper
	app    porttypes.IBCModule
}

func NewIBCModule(k keeper.Keeper, app porttypes.IBCModule) IBCModule {
	return IBCModule{keeper: k, app: app}
}

func (im IBCModule) OnRecvPacket(
	ctx sdk.Context,
	version string,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) ibcexported.Acknowledgement {
	var data ibctransfertypes.FungibleTokenPacketData
	if err := ibctransfertypes.ModuleCdc.UnmarshalJSON(packet.GetData(), &data); err == nil {
		if err := im.keeper.HandleInboundIBCTransfer(ctx, packet, data); err != nil {
			ctx.Logger().Error("crosschain inbound IBC handling failed", "error", err)
		}
	}
	return im.app.OnRecvPacket(ctx, version, packet, relayer)
}

func (im IBCModule) OnAcknowledgementPacket(ctx sdk.Context, version string, packet channeltypes.Packet, acknowledgement []byte, relayer sdk.AccAddress) error {
	if err := im.keeper.HandleOutboundIBCAck(ctx, packet, acknowledgement); err != nil {
		ctx.Logger().Error("crosschain outbound IBC ack handling failed", "error", err)
	}
	return im.app.OnAcknowledgementPacket(ctx, version, packet, acknowledgement, relayer)
}

func (im IBCModule) OnTimeoutPacket(ctx sdk.Context, version string, packet channeltypes.Packet, relayer sdk.AccAddress) error {
	if err := im.keeper.HandleOutboundIBCTimeout(ctx, packet); err != nil {
		ctx.Logger().Error("crosschain outbound IBC timeout handling failed", "error", err)
	}
	return im.app.OnTimeoutPacket(ctx, version, packet, relayer)
}

func (im IBCModule) OnChanOpenInit(ctx sdk.Context, order channeltypes.Order, connectionHops []string, portID, channelID string, counterparty channeltypes.Counterparty, version string) (string, error) {
	return im.app.OnChanOpenInit(ctx, order, connectionHops, portID, channelID, counterparty, version)
}

func (im IBCModule) OnChanOpenTry(ctx sdk.Context, order channeltypes.Order, connectionHops []string, portID, channelID string, counterparty channeltypes.Counterparty, counterpartyVersion string) (string, error) {
	return im.app.OnChanOpenTry(ctx, order, connectionHops, portID, channelID, counterparty, counterpartyVersion)
}

func (im IBCModule) OnChanOpenAck(ctx sdk.Context, portID, channelID, counterpartyChannelID, counterpartyVersion string) error {
	return im.app.OnChanOpenAck(ctx, portID, channelID, counterpartyChannelID, counterpartyVersion)
}

func (im IBCModule) OnChanOpenConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanOpenConfirm(ctx, portID, channelID)
}

func (im IBCModule) OnChanCloseInit(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseInit(ctx, portID, channelID)
}

func (im IBCModule) OnChanCloseConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseConfirm(ctx, portID, channelID)
}

// BridgeMemoPrefix identifies outbound bridge transfers in IBC packet memos.
const BridgeMemoPrefix = "crosschain:"

// FormatBridgeMemo encodes a transfer id into an IBC memo.
func FormatBridgeMemo(transferID uint64) string {
	return fmt.Sprintf("%s%d", BridgeMemoPrefix, transferID)
}

// ParseBridgeMemo extracts a transfer id from an IBC memo, if present.
func ParseBridgeMemo(memo string) (uint64, bool) {
	if !strings.HasPrefix(memo, BridgeMemoPrefix) {
		return 0, false
	}
	var id uint64
	if _, err := fmt.Sscanf(memo, BridgeMemoPrefix+"%d", &id); err != nil {
		return 0, false
	}
	return id, true
}
