// Regression coverage for chain liveness detection: /api/health and
// /api/ready previously reported the chain as fully healthy as long as the
// REST endpoint responded at all, even if the returned "latest" block was
// hours old (validator down, consensus halted) — a stalled chain looked
// identical to a healthy one to any monitoring hitting these endpoints.
const { computeBlockStaleness } = require('../utils/chainHealth');

describe('computeBlockStaleness', () => {
  const NOW = new Date('2026-08-16T12:00:00Z').getTime();

  test('a recent block is not stale', () => {
    const latestBlockTime = new Date(NOW - 5000).toISOString(); // 5s old
    const result = computeBlockStaleness(latestBlockTime, 60000, NOW);
    expect(result.isStale).toBe(false);
    expect(result.blockAgeMs).toBe(5000);
  });

  test('a block older than the threshold is stale', () => {
    const latestBlockTime = new Date(NOW - 120000).toISOString(); // 2 min old
    const result = computeBlockStaleness(latestBlockTime, 60000, NOW);
    expect(result.isStale).toBe(true);
    expect(result.blockAgeMs).toBe(120000);
  });

  test('a block exactly at the threshold is not yet stale', () => {
    const latestBlockTime = new Date(NOW - 60000).toISOString();
    const result = computeBlockStaleness(latestBlockTime, 60000, NOW);
    expect(result.isStale).toBe(false);
  });

  test('a missing block time is treated as not stale (avoids false alarms on malformed responses)', () => {
    const result = computeBlockStaleness(null, 60000, NOW);
    expect(result.isStale).toBe(false);
    expect(result.blockAgeMs).toBeNull();
  });
});
