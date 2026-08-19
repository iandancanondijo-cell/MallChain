/**
 * Minimal protobuf encoders for the x/marketplace escrow messages, mirrored
 * from proto/marketplace/marketplace/v1/tx.proto (field numbers must stay in
 * sync). Same hand-rolled-varint approach as mlcoinProto.ts — these are flat
 * messages with no nested/repeated fields, so a full protobuf runtime isn't
 * needed.
 */
import { Registry, type GeneratedType } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';

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

export const MSG_CREATE_ESCROW = '/marketplace.marketplace.v1.MsgCreateEscrow';
export const MSG_RELEASE_FUNDS = '/marketplace.marketplace.v1.MsgReleaseFunds';
export const MSG_REFUND_BUYER = '/marketplace.marketplace.v1.MsgRefundBuyer';
export const MSG_OPEN_DISPUTE = '/marketplace.marketplace.v1.MsgOpenDispute';

export interface MsgCreateEscrowValue {
  buyer: string;
  seller: string;
  amount: string;
  denom: string;
  description: string;
  disputeWindowSeconds: string;
}

export interface MsgReleaseFundsValue {
  escrowId: string;
  releaseBy: string;
}

export interface MsgRefundBuyerValue {
  escrowId: string;
  requestedBy: string;
}

export interface MsgOpenDisputeValue {
  escrowId: string;
  opener: string;
}

function encodeMsgCreateEscrow(msg: Partial<MsgCreateEscrowValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.buyer) parts.push(encodeStringField(1, msg.buyer));
  if (msg.seller) parts.push(encodeStringField(2, msg.seller));
  if (msg.amount) parts.push(encodeStringField(3, msg.amount));
  if (msg.denom) parts.push(encodeStringField(4, msg.denom));
  if (msg.description) parts.push(encodeStringField(5, msg.description));
  if (msg.disputeWindowSeconds) parts.push(encodeUint64Field(6, msg.disputeWindowSeconds));
  return concatBytes(...parts);
}

function encodeMsgReleaseFunds(msg: Partial<MsgReleaseFundsValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.escrowId) parts.push(encodeStringField(1, msg.escrowId));
  if (msg.releaseBy) parts.push(encodeStringField(2, msg.releaseBy));
  return concatBytes(...parts);
}

function encodeMsgRefundBuyer(msg: Partial<MsgRefundBuyerValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.escrowId) parts.push(encodeStringField(1, msg.escrowId));
  if (msg.requestedBy) parts.push(encodeStringField(2, msg.requestedBy));
  return concatBytes(...parts);
}

function encodeMsgOpenDispute(msg: Partial<MsgOpenDisputeValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.escrowId) parts.push(encodeStringField(1, msg.escrowId));
  if (msg.opener) parts.push(encodeStringField(2, msg.opener));
  return concatBytes(...parts);
}

function makeType<T extends object>(defaults: T, encodeFn: (msg: Partial<T>) => Uint8Array) {
  return {
    create(base: Partial<T> = {}): T {
      return { ...defaults, ...base };
    },
    encode(message: T) {
      return { finish: () => encodeFn(message) };
    },
    fromPartial(object: Partial<T> = {}): T {
      return { ...defaults, ...object };
    },
    decode(): T {
      throw new Error('decode is not implemented in this client helper');
    },
  };
}

const MsgCreateEscrowType = makeType<MsgCreateEscrowValue>(
  { buyer: '', seller: '', amount: '0', denom: '', description: '', disputeWindowSeconds: '0' },
  encodeMsgCreateEscrow
);
const MsgReleaseFundsType = makeType<MsgReleaseFundsValue>({ escrowId: '', releaseBy: '' }, encodeMsgReleaseFunds);
const MsgRefundBuyerType = makeType<MsgRefundBuyerValue>({ escrowId: '', requestedBy: '' }, encodeMsgRefundBuyer);
const MsgOpenDisputeType = makeType<MsgOpenDisputeValue>({ escrowId: '', opener: '' }, encodeMsgOpenDispute);

export function createMarketplaceRegistry(): Registry {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_CREATE_ESCROW, MsgCreateEscrowType as unknown as GeneratedType],
    [MSG_RELEASE_FUNDS, MsgReleaseFundsType as unknown as GeneratedType],
    [MSG_REFUND_BUYER, MsgRefundBuyerType as unknown as GeneratedType],
    [MSG_OPEN_DISPUTE, MsgOpenDisputeType as unknown as GeneratedType],
  ]);
}
