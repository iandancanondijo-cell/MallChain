const { Registry } = require('@cosmjs/proto-signing');
const { defaultRegistryTypes } = require('@cosmjs/stargate');

const MSG_TRANSFER_MALLCOIN = '/marketplace.mlcoin.v1.MsgTransferMallcoin';

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

function encodeUint64Field(fieldNumber, value) {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return concatBytes(tag, encodeVarint(value));
}

function encodeMsgTransferMallcoin(msg) {
  const parts = [];
  if (msg.creator !== undefined && msg.creator !== null) {
    parts.push(encodeStringField(1, msg.creator));
  }
  if (msg.amount !== undefined && msg.amount !== null) {
    parts.push(encodeUint64Field(2, msg.amount));
  }
  if (msg.to !== undefined && msg.to !== null) {
    parts.push(encodeStringField(3, msg.to));
  }
  return concatBytes(...parts);
}

const MsgTransferMallcoinType = {
  create(base = {}) {
    return {
      creator: base.creator || '',
      amount: base.amount || '0',
      to: base.to || '',
    };
  },
  encode(message) {
    return {
      finish: () => encodeMsgTransferMallcoin(message),
    };
  },
  fromPartial(object = {}) {
    return MsgTransferMallcoinType.create(object);
  },
  decode() {
    throw new Error('MsgTransferMallcoin decode is not implemented in this client helper');
  },
};

function createMlcoinRegistry() {
  return new Registry([...defaultRegistryTypes, [MSG_TRANSFER_MALLCOIN, MsgTransferMallcoinType]]);
}

module.exports = {
  MSG_TRANSFER_MALLCOIN,
  encodeMsgTransferMallcoin,
  createMlcoinRegistry,
};
