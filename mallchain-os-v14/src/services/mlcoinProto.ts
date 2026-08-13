/**
 * Minimal protobuf encoder for the chain's custom MsgTransferMallcoin message,
 * mirrored from backend/src/services/mlcoinProto.js so the frontend can sign
 * transactions the same way the backend does (field numbers must stay in sync
 * with proto/marketplace/mlcoin/v1/tx.proto).
 */
import { Registry, type GeneratedType } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';

export const MSG_TRANSFER_MALLCOIN = '/marketplace.mlcoin.v1.MsgTransferMallcoin';

export interface MsgTransferMallcoinValue {
  creator: string;
  amount: string;
  to: string;
}

function encodeVarint(value: number | bigint): Uint8Array {
  let current = typeof value === 'bigint' ? value : BigInt(value);
  const bytes: number[] = [];
  while (current > 0x7fn) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Uint8Array.from(bytes);
}

function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const array of arrays) total += array.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function encodeStringField(fieldNumber: number, value: string): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const bytes = utf8ToBytes(value);
  return concatBytes(tag, encodeVarint(bytes.length), bytes);
}

function encodeUint64Field(fieldNumber: number, value: number | string | bigint): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return concatBytes(tag, encodeVarint(typeof value === 'string' ? BigInt(value) : value));
}

export function encodeMsgTransferMallcoin(msg: Partial<MsgTransferMallcoinValue>): Uint8Array {
  const parts: Uint8Array[] = [];
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
  create(base: Partial<MsgTransferMallcoinValue> = {}): MsgTransferMallcoinValue {
    return {
      creator: base.creator || '',
      amount: base.amount || '0',
      to: base.to || '',
    };
  },
  encode(message: MsgTransferMallcoinValue) {
    return {
      finish: () => encodeMsgTransferMallcoin(message),
    };
  },
  fromPartial(object: Partial<MsgTransferMallcoinValue> = {}) {
    return MsgTransferMallcoinType.create(object);
  },
  decode(): MsgTransferMallcoinValue {
    throw new Error('MsgTransferMallcoin decode is not implemented in this client helper');
  },
};

export function createMlcoinRegistry(): Registry {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_TRANSFER_MALLCOIN, MsgTransferMallcoinType as unknown as GeneratedType],
  ]);
}
