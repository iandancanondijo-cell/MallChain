package keeper

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	clienttypes "github.com/cosmos/ibc-go/v10/modules/core/02-client/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	commitmenttypes "github.com/cosmos/ibc-go/v10/modules/core/23-commitment/types"
	host "github.com/cosmos/ibc-go/v10/modules/core/24-host"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"

	"marketplace/x/crosschain/types"
)

func (k Keeper) emitBridgeEvent(ctx sdk.Context, eventType string, attrs ...sdk.Attribute) {
	base := []sdk.Attribute{
		sdk.NewAttribute(sdk.AttributeKeyModule, types.ModuleName),
	}
	base = append(base, attrs...)
	ctx.EventManager().EmitEvent(sdk.NewEvent(eventType, base...))
}

func (k Keeper) SetChainRoute(ctx context.Context, chain string, route types.ChainRoute) error {
	return k.ChainRoutes.Set(ctx, chain, route)
}

func (k Keeper) GetChainRoute(ctx context.Context, chain string) (types.ChainRoute, error) {
	return k.ChainRoutes.Get(ctx, chain)
}

func (k Keeper) sendOutboundIBCTransfer(ctx sdk.Context, transfer types.BridgeTransfer, transferID uint64, route types.ChainRoute) error {
	params, err := k.GetParams(ctx)
	if err != nil {
		return err
	}

	portID := route.PortID
	if portID == "" {
		portID = types.DefaultPortID
	}
	if route.ChannelID == "" {
		return types.ErrInvalidChain
	}

	moduleAddr := authtypes.NewModuleAddress(types.ModuleName)
	timeoutBlocks := params.TransferTimeoutBlocks
	if timeoutBlocks == 0 {
		timeoutBlocks = 1000
	}
	timeoutTimestamp := uint64(ctx.BlockTime().Add(time.Duration(timeoutBlocks) * 5 * time.Second).UnixNano())

	coin := sdk.NewCoin(transfer.AssetDenom, transfer.Amount.Amount)
	msg := ibctransfertypes.NewMsgTransfer(
		portID,
		route.ChannelID,
		coin,
		moduleAddr.String(),
		transfer.Recipient,
		clienttypes.NewHeight(0, 0),
		timeoutTimestamp,
		types.FormatBridgeMemo(transferID),
	)

	resp, err := k.ibcKeeper.Transfer(ctx, msg)
	if err != nil {
		return err
	}

	meta := types.TransferMeta{
		InitHeight:       uint64(ctx.BlockHeight()),
		TimeoutBlocks:    timeoutBlocks,
		IBCSequence:      resp.Sequence,
		TimeoutTimestamp: timeoutTimestamp,
		PortID:           portID,
		ChannelID:        route.ChannelID,
	}
	if err := k.TransferMeta.Set(ctx, transferID, meta); err != nil {
		return err
	}

	k.emitBridgeEvent(ctx, types.EventTypeBridgeInitiated,
		sdk.NewAttribute(types.AttributeKeyTransferID, strconv.FormatUint(transferID, 10)),
		sdk.NewAttribute(types.AttributeKeySender, transfer.Sender),
		sdk.NewAttribute(types.AttributeKeyRecipient, transfer.Recipient),
		sdk.NewAttribute(types.AttributeKeyAmount, transfer.Amount.String()),
		sdk.NewAttribute(types.AttributeKeyDestChain, transfer.DestinationChain),
		sdk.NewAttribute(types.AttributeKeyChannelID, route.ChannelID),
		sdk.NewAttribute(types.AttributeKeyPortID, portID),
	)
	return nil
}

// HandleInboundIBCTransfer records inbound IBC transfers that complete bridge flows.
func (k Keeper) HandleInboundIBCTransfer(ctx sdk.Context, packet channeltypes.Packet, data ibctransfertypes.FungibleTokenPacketData) error {
	if _, ok := types.ParseBridgeMemo(data.Memo); ok {
		k.emitBridgeEvent(ctx, types.EventTypeIBCRecv,
			sdk.NewAttribute(types.AttributeKeyChannelID, packet.DestinationChannel),
			sdk.NewAttribute(types.AttributeKeyPortID, packet.DestinationPort),
			sdk.NewAttribute(types.AttributeKeyRecipient, data.Receiver),
			sdk.NewAttribute(types.AttributeKeyAmount, data.Amount),
		)
	}
	return nil
}

// HandleOutboundIBCAck marks a bridge transfer completed when IBC ack succeeds.
func (k Keeper) HandleOutboundIBCAck(ctx sdk.Context, packet channeltypes.Packet, acknowledgement []byte) error {
	var ack channeltypes.Acknowledgement
	if err := channeltypes.SubModuleCdc.UnmarshalJSON(acknowledgement, &ack); err != nil {
		return err
	}
	if !ack.Success() {
		return nil
	}

	var data ibctransfertypes.FungibleTokenPacketData
	if err := ibctransfertypes.ModuleCdc.UnmarshalJSON(packet.GetData(), &data); err != nil {
		return err
	}
	transferID, ok := types.ParseBridgeMemo(data.Memo)
	if !ok {
		return nil
	}

	transfer, err := k.GetBridgeTransfer(ctx, transferID)
	if err != nil {
		return err
	}
	if transfer.Status != "pending" {
		return nil
	}

	transfer.Status = "completed"
	if err := k.BridgeTransfers.Set(ctx, transferID, transfer); err != nil {
		return err
	}

	if err := k.moveTransferToCompleted(ctx, transferID, transfer); err != nil {
		return err
	}

	k.emitBridgeEvent(ctx, types.EventTypeBridgeCompleted,
		sdk.NewAttribute(types.AttributeKeyTransferID, strconv.FormatUint(transferID, 10)),
		sdk.NewAttribute(types.AttributeKeyStatus, "completed"),
		sdk.NewAttribute(types.AttributeKeyChannelID, packet.SourceChannel),
	)
	return nil
}

// HandleOutboundIBCTimeout refunds escrowed funds when an outbound IBC transfer times out.
func (k Keeper) HandleOutboundIBCTimeout(ctx sdk.Context, packet channeltypes.Packet) error {
	var data ibctransfertypes.FungibleTokenPacketData
	if err := ibctransfertypes.ModuleCdc.UnmarshalJSON(packet.GetData(), &data); err != nil {
		return err
	}
	transferID, ok := types.ParseBridgeMemo(data.Memo)
	if !ok {
		return nil
	}
	return k.refundTimedOutTransfer(ctx, transferID, "ibc_timeout")
}

func (k Keeper) moveTransferToCompleted(ctx context.Context, transferID uint64, transfer types.BridgeTransfer) error {
	bridgeState, err := k.BridgeState.Get(ctx)
	if err != nil {
		return err
	}

	if bridgeState.ChainBalances == nil {
		bridgeState.ChainBalances = make(map[string]uint64)
	}

	var pending []*types.BridgeTransfer
	for _, t := range bridgeState.PendingTransfers {
		if t != nil && t.Id != transferID {
			pending = append(pending, t)
		}
	}
	bridgeState.PendingTransfers = pending
	transferCopy := transfer
	bridgeState.CompletedTransfers = append(bridgeState.CompletedTransfers, &transferCopy)

	if transfer.Amount != nil {
		key := transfer.DestinationChain
		bridgeState.ChainBalances[key] += transfer.Amount.Amount.Uint64()
	}

	return k.BridgeState.Set(ctx, bridgeState)
}

func (k Keeper) refundTimedOutTransfer(ctx context.Context, transferID uint64, reason string) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	transfer, err := k.GetBridgeTransfer(sdkCtx, transferID)
	if err != nil {
		return err
	}
	if transfer.Status != "pending" {
		return nil
	}

	senderAddr, err := sdk.AccAddressFromBech32(transfer.Sender)
	if err != nil {
		return err
	}
	if transfer.Amount == nil {
		return types.ErrInvalidAmount
	}
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, senderAddr, sdk.NewCoins(*transfer.Amount)); err != nil {
		return err
	}

	transfer.Status = "timed_out"
	if err := k.BridgeTransfers.Set(ctx, transferID, transfer); err != nil {
		return err
	}
	if err := k.moveTransferToCompleted(ctx, transferID, transfer); err != nil {
		return err
	}
	_ = k.TransferMeta.Remove(ctx, transferID)

	eventType := types.EventTypeBridgeTimedOut
	if reason == "refund" {
		eventType = types.EventTypeBridgeRefunded
	}
	k.emitBridgeEvent(sdkCtx, eventType,
		sdk.NewAttribute(types.AttributeKeyTransferID, strconv.FormatUint(transferID, 10)),
		sdk.NewAttribute(types.AttributeKeySender, transfer.Sender),
		sdk.NewAttribute(types.AttributeKeyAmount, transfer.Amount.String()),
		sdk.NewAttribute(types.AttributeKeyStatus, transfer.Status),
	)
	return nil
}

// bridgeTransferProof is only the caller-supplied HALF of what
// verifyTransferProof checks: which light client, which height, and the
// actual ICS-23 merkle inclusion proof bytes. It deliberately does NOT
// carry the path or value being proven — those are reconstructed by the
// keeper itself from the transfer's own recorded fields (see
// verifyTransferProof), not accepted from the caller.
type bridgeTransferProof struct {
	ClientID       string `json:"client_id"`
	RevisionNumber uint64 `json:"revision_number"`
	RevisionHeight uint64 `json:"revision_height"`
	Height         uint64 `json:"height"`
	Proof          string `json:"proof"`
	ProofBytes     []byte `json:"proof_bytes"`
}

// verifyTransferProof proves that this transfer's real outbound IBC packet
// was actually committed on-chain, by reconstructing the EXACT ICS-24
// packet-commitment path and value from the transfer's own recorded fields
// (via TransferMeta, populated by sendOutboundIBCTransfer) and checking
// THAT reconstruction's membership — not whatever path/value the caller's
// proof claims. Trusting a caller-supplied path/value (the previous
// behavior) proved nothing about this specific transfer at all: any validly
// -formed merkle proof for any unrelated fact — or one against a caller's
// own self-controlled light client — would pass, letting a proof for one
// (possibly tiny, legitimate) transfer complete a completely different one.
func (k Keeper) verifyTransferProof(ctx sdk.Context, proof string, transfer types.BridgeTransfer) error {
	if k.ibcClientKeeper == nil {
		return types.ErrInvalidProof
	}

	// A transfer only has a real packet-commitment sequence recorded when
	// InitiateBridgeTransfer found a configured chain route (see
	// sendOutboundIBCTransfer) — IBCSequence stays 0 otherwise. With no real
	// packet ever sent, there is no legitimate commitment to prove, so this
	// must reject outright rather than accept whatever the caller claims.
	meta, err := k.TransferMeta.Get(ctx, transfer.Id)
	if err != nil || meta.IBCSequence == 0 || meta.PortID == "" || meta.ChannelID == "" {
		return fmt.Errorf("%w: no real IBC packet was ever sent for transfer %d", types.ErrInvalidProof, transfer.Id)
	}

	parsedProof, err := parseBridgeTransferProof(proof)
	if err != nil {
		return err
	}
	if parsedProof.ClientID == "" {
		return types.ErrInvalidProof
	}

	revisionHeight := parsedProof.RevisionHeight
	if revisionHeight == 0 {
		revisionHeight = parsedProof.Height
	}
	if revisionHeight == 0 {
		return types.ErrInvalidProof
	}

	// Reconstructs the exact bytes sendOutboundIBCTransfer's real
	// MsgTransfer caused ibc-transfer to commit — same fields
	// HandleOutboundIBCAck already assumes on the decode side (plain
	// FungibleTokenPacketData, not a v2/multi-denom packet).
	packetData := ibctransfertypes.FungibleTokenPacketData{
		Denom:    transfer.AssetDenom,
		Amount:   transfer.Amount.Amount.String(),
		Sender:   authtypes.NewModuleAddress(types.ModuleName).String(),
		Receiver: transfer.Recipient,
		Memo:     types.FormatBridgeMemo(transfer.Id),
	}
	packet := channeltypes.NewPacket(
		packetData.GetBytes(),
		meta.IBCSequence,
		meta.PortID, meta.ChannelID,
		"", "", // destination port/channel don't factor into CommitPacket's hash
		clienttypes.NewHeight(0, 0),
		meta.TimeoutTimestamp,
	)
	expectedValue := channeltypes.CommitPacket(packet)
	expectedPath := commitmenttypes.NewMerklePath(
		[]byte(ibcexported.StoreKey),
		host.PacketCommitmentKey(meta.PortID, meta.ChannelID, meta.IBCSequence),
	)

	clientModule, err := k.ibcClientKeeper.Route(ctx, parsedProof.ClientID)
	if err != nil {
		return fmt.Errorf("%w: %v", types.ErrInvalidProof, err)
	}
	if clientModule.Status(ctx, parsedProof.ClientID) != ibcexported.Active {
		return fmt.Errorf("%w: client %s is not active", types.ErrInvalidProof, parsedProof.ClientID)
	}

	if err := clientModule.VerifyMembership(
		ctx,
		parsedProof.ClientID,
		clienttypes.NewHeight(parsedProof.RevisionNumber, revisionHeight),
		0,
		0,
		parsedProof.ProofBytes,
		expectedPath,
		expectedValue,
	); err != nil {
		return fmt.Errorf("%w: %v", types.ErrInvalidProof, err)
	}
	return nil
}

func parseBridgeTransferProof(proof string) (bridgeTransferProof, error) {
	if proof == "" {
		return bridgeTransferProof{}, types.ErrInvalidProof
	}

	proofBytes := []byte(proof)
	if decoded, err := base64.StdEncoding.DecodeString(proof); err == nil && len(decoded) > 0 {
		proofBytes = decoded
	}

	var parsed bridgeTransferProof
	if err := json.Unmarshal(proofBytes, &parsed); err != nil {
		return bridgeTransferProof{}, types.ErrInvalidProof
	}

	if len(parsed.ProofBytes) == 0 {
		if decoded, err := decodeProofValue(parsed.Proof); err == nil && len(decoded) > 0 {
			parsed.ProofBytes = decoded
		}
	}
	if len(parsed.ProofBytes) == 0 {
		return bridgeTransferProof{}, types.ErrInvalidProof
	}
	return parsed, nil
}

func decodeProofValue(value string) ([]byte, error) {
	if value == "" {
		return nil, types.ErrInvalidProof
	}
	if decoded, err := base64.StdEncoding.DecodeString(value); err == nil && len(decoded) > 0 {
		return decoded, nil
	}
	return nil, types.ErrInvalidProof
}

