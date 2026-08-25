/**
 * Minimal protobuf encoder for the chain's custom vault messages, mirrored
 * from mlcoinProto.ts's pattern so the frontend can sign these transactions
 * itself (field numbers must stay in sync with
 * proto/marketplace/vault/v1/tx.proto).
 */
import { Registry, type GeneratedType } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';

export const MSG_SETUP_VAULT = '/marketplace.vault.v1.MsgSetupVault';
export const MSG_CONFIRM_VAULT = '/marketplace.vault.v1.MsgConfirmVault';
export const MSG_DISABLE_VAULT = '/marketplace.vault.v1.MsgDisableVault';

export interface MsgSetupVaultValue {
  authority: string;
  salt: string;
  kdfTime: number;
  kdfMemory: number;
  kdfThreads: number;
  kdfKeyLen: number;
  nonceTotp: string;
  encryptedTotpSecret: string;
}

export interface MsgConfirmVaultValue {
  authority: string;
  noncePriv: string;
  ciphertext: string;
  publicKey: string;
}

export interface MsgDisableVaultValue {
  authority: string;
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

export function encodeMsgSetupVault(msg: Partial<MsgSetupVaultValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.authority) parts.push(encodeStringField(1, msg.authority));
  if (msg.salt) parts.push(encodeStringField(2, msg.salt));
  if (msg.kdfTime) parts.push(encodeVarintField(3, msg.kdfTime));
  if (msg.kdfMemory) parts.push(encodeVarintField(4, msg.kdfMemory));
  if (msg.kdfThreads) parts.push(encodeVarintField(5, msg.kdfThreads));
  if (msg.kdfKeyLen) parts.push(encodeVarintField(6, msg.kdfKeyLen));
  if (msg.nonceTotp) parts.push(encodeStringField(7, msg.nonceTotp));
  if (msg.encryptedTotpSecret) parts.push(encodeStringField(8, msg.encryptedTotpSecret));
  return concatBytes(...parts);
}

export function encodeMsgConfirmVault(msg: Partial<MsgConfirmVaultValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.authority) parts.push(encodeStringField(1, msg.authority));
  if (msg.noncePriv) parts.push(encodeStringField(2, msg.noncePriv));
  if (msg.ciphertext) parts.push(encodeStringField(3, msg.ciphertext));
  if (msg.publicKey) parts.push(encodeStringField(4, msg.publicKey));
  return concatBytes(...parts);
}

export function encodeMsgDisableVault(msg: Partial<MsgDisableVaultValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.authority) parts.push(encodeStringField(1, msg.authority));
  return concatBytes(...parts);
}

const MsgSetupVaultType = {
  create(base: Partial<MsgSetupVaultValue> = {}): MsgSetupVaultValue {
    return {
      authority: base.authority || '',
      salt: base.salt || '',
      kdfTime: base.kdfTime || 0,
      kdfMemory: base.kdfMemory || 0,
      kdfThreads: base.kdfThreads || 0,
      kdfKeyLen: base.kdfKeyLen || 0,
      nonceTotp: base.nonceTotp || '',
      encryptedTotpSecret: base.encryptedTotpSecret || '',
    };
  },
  encode(message: MsgSetupVaultValue) {
    return { finish: () => encodeMsgSetupVault(message) };
  },
  fromPartial(object: Partial<MsgSetupVaultValue> = {}) {
    return MsgSetupVaultType.create(object);
  },
  decode(): MsgSetupVaultValue {
    throw new Error('MsgSetupVault decode is not implemented in this client helper');
  },
};

const MsgConfirmVaultType = {
  create(base: Partial<MsgConfirmVaultValue> = {}): MsgConfirmVaultValue {
    return {
      authority: base.authority || '',
      noncePriv: base.noncePriv || '',
      ciphertext: base.ciphertext || '',
      publicKey: base.publicKey || '',
    };
  },
  encode(message: MsgConfirmVaultValue) {
    return { finish: () => encodeMsgConfirmVault(message) };
  },
  fromPartial(object: Partial<MsgConfirmVaultValue> = {}) {
    return MsgConfirmVaultType.create(object);
  },
  decode(): MsgConfirmVaultValue {
    throw new Error('MsgConfirmVault decode is not implemented in this client helper');
  },
};

const MsgDisableVaultType = {
  create(base: Partial<MsgDisableVaultValue> = {}): MsgDisableVaultValue {
    return { authority: base.authority || '' };
  },
  encode(message: MsgDisableVaultValue) {
    return { finish: () => encodeMsgDisableVault(message) };
  },
  fromPartial(object: Partial<MsgDisableVaultValue> = {}) {
    return MsgDisableVaultType.create(object);
  },
  decode(): MsgDisableVaultValue {
    throw new Error('MsgDisableVault decode is not implemented in this client helper');
  },
};

export function createVaultRegistry(): Registry {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_SETUP_VAULT, MsgSetupVaultType as unknown as GeneratedType],
    [MSG_CONFIRM_VAULT, MsgConfirmVaultType as unknown as GeneratedType],
    [MSG_DISABLE_VAULT, MsgDisableVaultType as unknown as GeneratedType],
  ]);
}
