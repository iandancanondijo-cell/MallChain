// Hand-rolled protobuf encoder for MsgIssueBadge, since it isn't in
// @cosmjs/stargate's default registry — same reason/pattern as
// mlcoinProto.js's MsgTransferMallcoin encoder (copy that file's approach,
// NOT dexTxBuilder.js's/burnTxBuilder.js's, which omit a custom registry
// entirely and would throw "Unregistered type url" on any real broadcast).
// Field numbers must match proto/marketplace/badge/v1/tx.proto exactly:
// creator = 1, recipient = 2, badge_type = 3.
const { Registry } = require('@cosmjs/proto-signing');
const { defaultRegistryTypes } = require('@cosmjs/stargate');

const MSG_ISSUE_BADGE = '/marketplace.badge.v1.MsgIssueBadge';

function encodeVarint(value) {
  let current = typeof value === 'bigint' ? value : BigInt(value);
  const bytes = [];
  while (current > 0x7fn) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Uint8Array.from(bytes);
}

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

function concatBytes(...arrays) {
  let total = 0;
  for (const array of arrays) {
    total += array.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function encodeStringField(fieldNumber, value) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const bytes = utf8ToBytes(value);
  return concatBytes(tag, encodeVarint(bytes.length), bytes);
}

function encodeMsgIssueBadge(msg) {
  const parts = [];
  if (msg.creator) parts.push(encodeStringField(1, msg.creator));
  if (msg.recipient) parts.push(encodeStringField(2, msg.recipient));
  if (msg.badgeType) parts.push(encodeStringField(3, msg.badgeType));
  return concatBytes(...parts);
}

const MsgIssueBadgeType = {
  create(base = {}) {
    return {
      creator: base.creator || '',
      recipient: base.recipient || '',
      badgeType: base.badgeType || '',
    };
  },
  encode(message) {
    return {
      finish: () => encodeMsgIssueBadge(message),
    };
  },
  fromPartial(object = {}) {
    return MsgIssueBadgeType.create(object);
  },
  decode() {
    throw new Error('MsgIssueBadge decode is not implemented in this client helper');
  },
};

function createBadgeRegistry() {
  return new Registry([...defaultRegistryTypes, [MSG_ISSUE_BADGE, MsgIssueBadgeType]]);
}

module.exports = {
  MSG_ISSUE_BADGE,
  encodeMsgIssueBadge,
  createBadgeRegistry,
};
