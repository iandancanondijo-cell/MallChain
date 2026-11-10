/**
 * Self-bond helper tests.
 *
 * toValoperAddress is the only piece of this module that runs inside the
 * render path of ValidatorsProfile, so a throw here takes the whole page down
 * for every applicant. The installed @cosmjs/encoding passes a default limit
 * of Infinity through to @scure/base's bech32 decoder, which rejects it as a
 * RangeError — hence the explicit finite limit wallet.ts already carries.
 * These tests use the real dependency (no mock) so they fail if the limit is
 * dropped again.
 */
import { describe, test, expect } from 'vitest';
import { toBech32, fromBech32 } from '@cosmjs/encoding';
import { toValoperAddress } from './validatorCreateTx';
import { chain } from './config';

// A real 20-byte account address built through the same encoder the wallet
// uses, so the checksum is valid rather than an invented string.
const DATA = new Uint8Array(20).map((_, i) => i + 1);
const ACCOUNT = toBech32(chain.addressPrefix, DATA);

describe('toValoperAddress', () => {
  test('derives the operator address from the same 20-byte key', () => {
    const valoper = toValoperAddress(ACCOUNT);

    expect(valoper.startsWith(`${chain.addressPrefix}valoper1`)).toBe(true);
    expect(fromBech32(valoper, 1000).data).toEqual(DATA);
  });

  test('does not throw for a well-formed account address', () => {
    expect(() => toValoperAddress(ACCOUNT)).not.toThrow();
  });

  test('is not a string splice — it re-encodes the key bytes', () => {
    // Swapping the prefix textually would still land on a different payload
    // whenever the account string carries a separator the prefix already ends
    // with; only re-encoding the raw 20 bytes is correct.
    expect(toValoperAddress(ACCOUNT)).toBe(toBech32(`${chain.addressPrefix}valoper`, DATA));
  });
});
