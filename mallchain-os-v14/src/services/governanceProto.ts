/**
 * Minimal protobuf encoder for the chain's custom x/governance MsgVote,
 * mirrored from proto/marketplace/governance/v1/tx.proto (field numbers must
 * stay in sync with that file). Same hand-rolled-varint approach as
 * mlcoinProto.ts, since this is a custom module (not stock cosmos.gov) and
 * cosmjs has no built-in support for it.
 */
import { Registry, type GeneratedType } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';

export const MSG_VOTE = '/marketplace.governance.v1.MsgVote';

export type VoteOption = 'VOTE_OPTION_YES' | 'VOTE_OPTION_ABSTAIN' | 'VOTE_OPTION_NO' | 'VOTE_OPTION_NO_WITH_VETO';

const VOTE_OPTION_NUMBER: Record<VoteOption, number> = {
  VOTE_OPTION_YES: 1,
  VOTE_OPTION_ABSTAIN: 2,
  VOTE_OPTION_NO: 3,
  VOTE_OPTION_NO_WITH_VETO: 4,
};

export interface MsgVoteValue {
  proposalId: string;
  voter: string;
  option: VoteOption;
  metadata: string;
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

function encodeVarintField(fieldNumber: number, value: number | string | bigint): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  return concatBytes(tag, encodeVarint(typeof value === 'string' ? BigInt(value) : value));
}

export function encodeMsgVote(msg: Partial<MsgVoteValue>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (msg.proposalId !== undefined) parts.push(encodeVarintField(1, msg.proposalId));
  if (msg.voter) parts.push(encodeStringField(2, msg.voter));
  if (msg.option) parts.push(encodeVarintField(3, VOTE_OPTION_NUMBER[msg.option]));
  if (msg.metadata) parts.push(encodeStringField(4, msg.metadata));
  return concatBytes(...parts);
}

const MsgVoteType = {
  create(base: Partial<MsgVoteValue> = {}): MsgVoteValue {
    return {
      proposalId: base.proposalId || '0',
      voter: base.voter || '',
      option: base.option || 'VOTE_OPTION_YES',
      metadata: base.metadata || '',
    };
  },
  encode(message: MsgVoteValue) {
    return { finish: () => encodeMsgVote(message) };
  },
  fromPartial(object: Partial<MsgVoteValue> = {}) {
    return MsgVoteType.create(object);
  },
  decode(): MsgVoteValue {
    throw new Error('MsgVote decode is not implemented in this client helper');
  },
};

export function createGovernanceRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, [MSG_VOTE, MsgVoteType as unknown as GeneratedType]]);
}
