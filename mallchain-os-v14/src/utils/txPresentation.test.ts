/**
 * txPresentation — the one place a transaction row's words, icon and time are
 * decided for the four surfaces that list transactions.
 *
 * The rule being protected: direction and category are different axes. Colour
 * and counterparty follow which side this wallet was on; the icon and the
 * words follow what the on-chain message did. And a timestamp the node never
 * reported (0) is rendered as those words, not as 1 January 1970.
 */
import { describe, it, expect } from 'vitest';
import { txAmountColor, txIcon, txTimeText, txTitle } from './txPresentation';
import type { Transaction } from '../services/walletApi';

const row = (overrides: Partial<Transaction>): Transaction => ({
  id: 'x',
  type: 'send',
  txType: 'send',
  txTypeLabel: 'Sent',
  amount: 1,
  asset: 'MALL',
  status: 'confirmed',
  ts: Date.parse('2026-11-03T10:00:00Z'),
  ...overrides,
});

describe('txTitle', () => {
  it('uses the server’s own label when it already carries the direction', () => {
    expect(txTitle(row({ txTypeLabel: 'Sent' }))).toBe('Sent');
    expect(txTitle(row({ type: 'receive', txType: 'receive', txTypeLabel: 'Received' }))).toBe('Received');
  });

  it('adds the direction when the category does not state it', () => {
    // A stake signed by this wallet and a purchase credited to it are both
    // 'Staked'/'Mallcoin purchase' — the reader still needs to know which way
    // the value moved.
    expect(txTitle(row({ txType: 'stake', txTypeLabel: 'Staked' }))).toBe('Staked · sent');
    expect(txTitle(row({ type: 'receive', txType: 'purchase', txTypeLabel: 'Mallcoin purchase' }))).toBe('Mallcoin purchase · received');
  });

  it('falls back to the direction when a server has no label for the row', () => {
    expect(txTitle(row({ txTypeLabel: '' })).toLowerCase()).toContain('sent');
    expect(txTitle(row({ type: 'receive', txTypeLabel: '' })).toLowerCase()).toContain('received');
  });
});

describe('txIcon', () => {
  it('follows the category, not the direction', () => {
    // Both of these are 'send' as a direction; they are not the same activity
    // and must not draw the same arrow.
    expect(txIcon(row({ type: 'send', txType: 'send' }))).not.toBe(txIcon(row({ type: 'send', txType: 'stake' })));
    expect(txIcon(row({ type: 'send', txType: 'stake' }))).toBe('📌');
  });

  it('still draws something for a category it has never heard of', () => {
    expect(txIcon(row({ txType: 'whatever_comes_next' }))).toBe('➤');
    expect(txIcon(row({ type: 'receive', txType: 'whatever_comes_next' }))).toBe('⬇');
  });
});

describe('txAmountColor', () => {
  it('follows the direction only', () => {
    expect(txAmountColor(row({ type: 'send', txType: 'stake' }))).toBe('var(--red-2)');
    expect(txAmountColor(row({ type: 'receive', txType: 'purchase' }))).toBe('var(--green-2)');
  });
});

describe('txTimeText', () => {
  it('renders a real instant', () => {
    expect(txTimeText(Date.parse('2026-11-03T10:00:00Z'), 'en-GB')).toContain('03/11/2026');
  });

  it('says the truth for an unknown time instead of printing 1970', () => {
    for (const ts of [0, Number.NaN]) {
      expect(txTimeText(ts)).toBe('time not reported');
      expect(txTimeText(ts)).not.toMatch(/1970/);
    }
  });
});
