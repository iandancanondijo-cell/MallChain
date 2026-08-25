// Hand-rolled protobuf encoder for x/dex's Msg types, since they aren't in
// @cosmjs/stargate's default registry — same reason/pattern as
// mlcoinProto.js's/badgeProto.js's encoders. dexTxBuilder.js used to omit a
// custom registry entirely (matching the exact anti-pattern badgeProto.js's
// header comment warns against) and would throw "Unregistered type url" on
// any real broadcast of MsgAddLiquidity — this is what actually lets that
// call succeed.
// Field numbers must match proto/marketplace/dex/v1/tx.proto exactly.
const { Registry } = require('@cosmjs/proto-signing');
const { defaultRegistryTypes } = require('@cosmjs/stargate');
const { Coin } = require('cosmjs-types/cosmos/base/v1beta1/coin');

const MSG_CREATE_POOL = '/marketplace.dex.v1.MsgCreatePool';
const MSG_ADD_LIQUIDITY = '/marketplace.dex.v1.MsgAddLiquidity';
const MSG_REMOVE_LIQUIDITY = '/marketplace.dex.v1.MsgRemoveLiquidity';
const MSG_SWAP = '/marketplace.dex.v1.MsgSwap';

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
  for (const array of arrays) total += array.length;
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

function encodeVarintField(fieldNumber, value) {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return concatBytes(tag, encodeVarint(value));
}

// Coin is itself a message, so it's embedded the same way a string is
// (wire type 2, length-delimited) — the payload is just the Coin's own
// encoded bytes instead of UTF-8 text.
function encodeCoinField(fieldNumber, coin) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const bytes = Coin.encode({ denom: coin.denom, amount: String(coin.amount) }).finish();
  return concatBytes(tag, encodeVarint(bytes.length), bytes);
}

function encodeMsgCreatePool(msg) {
  const parts = [];
  if (msg.creator) parts.push(encodeStringField(1, msg.creator));
  if (msg.tokenA) parts.push(encodeCoinField(2, msg.tokenA));
  if (msg.tokenB) parts.push(encodeCoinField(3, msg.tokenB));
  if (msg.fee) parts.push(encodeStringField(4, msg.fee));
  return concatBytes(...parts);
}

function encodeMsgAddLiquidity(msg) {
  const parts = [];
  if (msg.provider) parts.push(encodeStringField(1, msg.provider));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.tokenAAmount) parts.push(encodeCoinField(3, msg.tokenAAmount));
  if (msg.tokenBAmount) parts.push(encodeCoinField(4, msg.tokenBAmount));
  return concatBytes(...parts);
}

function encodeMsgRemoveLiquidity(msg) {
  const parts = [];
  if (msg.provider) parts.push(encodeStringField(1, msg.provider));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.liquidityTokens) parts.push(encodeCoinField(3, msg.liquidityTokens));
  return concatBytes(...parts);
}

function encodeMsgSwap(msg) {
  const parts = [];
  if (msg.sender) parts.push(encodeStringField(1, msg.sender));
  if (msg.poolId !== undefined) parts.push(encodeVarintField(2, msg.poolId));
  if (msg.tokenIn) parts.push(encodeCoinField(3, msg.tokenIn));
  if (msg.tokenOutDenom) parts.push(encodeStringField(4, msg.tokenOutDenom));
  if (msg.minTokenOut) parts.push(encodeCoinField(5, msg.minTokenOut));
  return concatBytes(...parts);
}

function makeType(encodeFn, defaults) {
  return {
    create(base = {}) {
      return { ...defaults, ...base };
    },
    encode(message) {
      return { finish: () => encodeFn(message) };
    },
    fromPartial(object = {}) {
      return { ...defaults, ...object };
    },
    decode() {
      throw new Error('decode is not implemented in this server-side helper');
    },
  };
}

const MsgCreatePoolType = makeType(encodeMsgCreatePool, { creator: '', tokenA: undefined, tokenB: undefined, fee: '0' });
const MsgAddLiquidityType = makeType(encodeMsgAddLiquidity, { provider: '', poolId: 0, tokenAAmount: undefined, tokenBAmount: undefined });
const MsgRemoveLiquidityType = makeType(encodeMsgRemoveLiquidity, { provider: '', poolId: 0, liquidityTokens: undefined });
const MsgSwapType = makeType(encodeMsgSwap, { sender: '', poolId: 0, tokenIn: undefined, tokenOutDenom: '', minTokenOut: undefined });

function createDexRegistry() {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_CREATE_POOL, MsgCreatePoolType],
    [MSG_ADD_LIQUIDITY, MsgAddLiquidityType],
    [MSG_REMOVE_LIQUIDITY, MsgRemoveLiquidityType],
    [MSG_SWAP, MsgSwapType],
  ]);
}

module.exports = {
  MSG_CREATE_POOL,
  MSG_ADD_LIQUIDITY,
  MSG_REMOVE_LIQUIDITY,
  MSG_SWAP,
  createDexRegistry,
};
