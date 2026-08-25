/**
 * Minimal protobuf encoder for x/dex's Msg types, mirrored from
 * mlcoinProto.ts's pattern (and from backend/src/services/dexProto.js,
 * which fixed the same encoding gap server-side) so the frontend can sign
 * these transactions itself. Field numbers must stay in sync with
 * proto/marketplace/dex/v1/tx.proto.
 */
import { Registry, type GeneratedType } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin';

export const MSG_CREATE_POOL = '/marketplace.dex.v1.MsgCreatePool';
export const MSG_ADD_LIQUIDITY = '/marketplace.dex.v1.MsgAddLiquidity';
export const MSG_REMOVE_LIQUIDITY = '/marketplace.dex.v1.MsgRemoveLiquidity';
export const MSG_SWAP = '/marketplace.dex.v1.MsgSwap';

export interface CoinValue {
  denom: string;
  amount: string;
}

export interface MsgSwapValue {
  sender: string;
  poolId: number;
  tokenIn: CoinValue;
  tokenOutDenom: string;
  minTokenOut: CoinValue;
}

export interface MsgAddLiquidityValue {
  provider: string;
  poolId: number;
  tokenAAmount: CoinValue;
  tokenBAmount: CoinValue;
}

export interface MsgRemoveLiquidityValue {
  provider: string;
  poolId: number;
  liquidityTokens: CoinValue;
}

export interface MsgCreatePoolValue {
  creator: string;
  tokenA: CoinValue;
  tokenB: CoinValue;
  fee: string;
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

function encodeVarintField(fieldNumber: number, value: number): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return concatBytes(tag, encodeVarint(value));
}

// Coin is itself a message, so it's embedded the same way a string is (wire
// type 2, length-delimited) — the payload is Coin's own encoded bytes,
// produced by cosmjs-types' own encoder rather than hand-rolled here.
function encodeCoinField(fieldNumber: number, coin: CoinValue): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const bytes = Coin.encode({ denom: coin.denom, amount: String(coin.amount) }).finish();
  return concatBytes(tag, encodeVarint(bytes.length), bytes);
}

export function encodeMsgSwap(msg: Partial<MsgSwapValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.sender) parts.push(encodeStringField(1, msg.sender));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.tokenIn) parts.push(encodeCoinField(3, msg.tokenIn));
  if (msg.tokenOutDenom) parts.push(encodeStringField(4, msg.tokenOutDenom));
  if (msg.minTokenOut) parts.push(encodeCoinField(5, msg.minTokenOut));
  return concatBytes(...parts);
}

export function encodeMsgAddLiquidity(msg: Partial<MsgAddLiquidityValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.provider) parts.push(encodeStringField(1, msg.provider));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.tokenAAmount) parts.push(encodeCoinField(3, msg.tokenAAmount));
  if (msg.tokenBAmount) parts.push(encodeCoinField(4, msg.tokenBAmount));
  return concatBytes(...parts);
}

export function encodeMsgRemoveLiquidity(msg: Partial<MsgRemoveLiquidityValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.provider) parts.push(encodeStringField(1, msg.provider));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.liquidityTokens) parts.push(encodeCoinField(3, msg.liquidityTokens));
  return concatBytes(...parts);
}

export function encodeMsgCreatePool(msg: Partial<MsgCreatePoolValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.creator) parts.push(encodeStringField(1, msg.creator));
  if (msg.tokenA) parts.push(encodeCoinField(2, msg.tokenA));
  if (msg.tokenB) parts.push(encodeCoinField(3, msg.tokenB));
  if (msg.fee) parts.push(encodeStringField(4, msg.fee));
  return concatBytes(...parts);
}

function makeType<T extends object>(encodeFn: (msg: Partial<T>) => Uint8Array, defaults: T) {
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

const MsgSwapType = makeType<MsgSwapValue>(encodeMsgSwap, {
  sender: '', poolId: 0, tokenIn: { denom: '', amount: '0' }, tokenOutDenom: '', minTokenOut: { denom: '', amount: '0' },
});
const MsgAddLiquidityType = makeType<MsgAddLiquidityValue>(encodeMsgAddLiquidity, {
  provider: '', poolId: 0, tokenAAmount: { denom: '', amount: '0' }, tokenBAmount: { denom: '', amount: '0' },
});
const MsgRemoveLiquidityType = makeType<MsgRemoveLiquidityValue>(encodeMsgRemoveLiquidity, {
  provider: '', poolId: 0, liquidityTokens: { denom: '', amount: '0' },
});
const MsgCreatePoolType = makeType<MsgCreatePoolValue>(encodeMsgCreatePool, {
  creator: '', tokenA: { denom: '', amount: '0' }, tokenB: { denom: '', amount: '0' }, fee: '0',
});

export function createDexRegistry(): Registry {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_CREATE_POOL, MsgCreatePoolType as unknown as GeneratedType],
    [MSG_ADD_LIQUIDITY, MsgAddLiquidityType as unknown as GeneratedType],
    [MSG_REMOVE_LIQUIDITY, MsgRemoveLiquidityType as unknown as GeneratedType],
    [MSG_SWAP, MsgSwapType as unknown as GeneratedType],
  ]);
}
