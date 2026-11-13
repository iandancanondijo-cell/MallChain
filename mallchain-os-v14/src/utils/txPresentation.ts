/**
 * How a transaction row is drawn.
 *
 * Four surfaces list transactions — the dashboard's recent-activity card,
 * Wallet Hub, Wallet History and the Transaction History page — and each used
 * to carry its own inline chain of `t.type === 'send' ? … : …` ternaries. That
 * is how a category the row now publishes (`txType`, from GET /api/tx/types)
 * would end up rendered as an icon in one view and as a bare word in another.
 *
 * Two axes, deliberately kept apart:
 *   direction ('send' | 'receive') — which side this wallet was on.
 *   txType  ('stake', 'purchase', …) — what the on-chain message did.
 * Colour and counterparty follow the direction; the icon and the words follow
 * the category.
 */
import type { Transaction } from '../services/walletApi';

const ICON_BY_CATEGORY: Record<string, string> = {
  send: '➤',
  receive: '⬇',
  purchase: '🛒',
  sale: '💱',
  swap: '⇄',
  stake: '📌',
  unstake: '📍',
  redelegate: '↪',
  reward: '✦',
  convert: '🔄',
  liquidity: '💧',
  escrow: '🔒',
  refund: '↩',
  dispute: '⚠',
  badge: '🎖',
  vault: '🗄',
  bridge: '🌉',
  attestation: '📄',
  contract: '⚙',
  governance: '🗳',
  penalty: '⚠',
  validator: '🖥',
  authorization: '✅',
  params: '🛠',
  mint: '🏭',
  burn: '🔥',
};

/** The row's icon: the category if it is known, otherwise the direction. */
export function txIcon(tx: Pick<Transaction, 'type' | 'txType'>): string {
  return ICON_BY_CATEGORY[tx.txType] ?? (tx.type === 'receive' ? '⬇' : '➤');
}

/** Colour token for a row's amount, following the direction. */
export function txAmountColor(tx: Pick<Transaction, 'type'>): string {
  return tx.type === 'send' ? 'var(--red-2)' : 'var(--green-2)';
}

/**
 * The words for a row: the server's own category label, with the direction
 * alongside when the category does not already say it ('Sent' and 'Received'
 * do; 'Staked' does not).
 */
export function txTitle(tx: Pick<Transaction, 'type' | 'txType' | 'txTypeLabel'>): string {
  const label = tx.txTypeLabel || (tx.type === 'receive' ? 'Received' : 'Sent');
  if (/sent|received/i.test(label)) return label;
  return `${label} · ${tx.type === 'receive' ? 'received' : 'sent'}`;
}

/**
 * A row's time as text. `ts === 0` is what the backend publishes for "the node
 * gave no readable timestamp"; rendering it as a date would print 1 January
 * 1970, which looks like a fact and is not one.
 */
export function txTimeText(ts: number, locale?: string): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'time not reported';
  return new Date(ts).toLocaleString(locale);
}
