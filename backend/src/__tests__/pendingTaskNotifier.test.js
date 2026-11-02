/**
 * Unit tests for the pending-task notifier's pure decision logic — the cooldown
 * gate and snapshot signature. No DB, no email. These lock the behaviour the
 * live run verified: identical counts within the reminder window are skipped,
 * changed counts send, a stale-but-unchanged queue re-sends after the interval,
 * and an empty queue never sends.
 */
const { _internals } = require('../jobs/pendingTaskNotifier');
const { shouldSend, snapshotSignature } = _internals;

describe('pendingTaskNotifier snapshotSignature', () => {
  it('is order-independent across categories and keys', () => {
    const a = snapshotSignature({
      kyc: { totals: { kycPending: 2, amlPending: 1 } },
      mining: { totals: { taskSubmissions: 0, badgePurchases: 3 } },
    });
    const b = snapshotSignature({
      mining: { totals: { badgePurchases: 3, taskSubmissions: 0 } },
      kyc: { totals: { amlPending: 1, kycPending: 2 } },
    });
    expect(a).toBe(b);
  });

  it('changes when any count changes', () => {
    const base = snapshotSignature({ kyc: { totals: { kycPending: 2 } } });
    const bumped = snapshotSignature({ kyc: { totals: { kycPending: 3 } } });
    expect(base).not.toBe(bumped);
  });
});

describe('pendingTaskNotifier shouldSend', () => {
  const sig = 'kyc.amlPending:1|kyc.kycPending:2';

  it('never sends for an empty queue', () => {
    expect(shouldSend(sig, 0, null).send).toBe(false);
  });

  it('sends on the first run with open items', () => {
    expect(shouldSend(sig, 3, null).send).toBe(true);
  });

  it('sends when counts changed since last email', () => {
    const last = { signature: 'other', sentAt: new Date().toISOString() };
    expect(shouldSend(sig, 3, last).send).toBe(true);
  });

  it('skips when unchanged within the reminder window', () => {
    process.env.PENDING_TASK_NOTIFY_REMINDER_HOURS = '24';
    const last = { signature: sig, sentAt: new Date().toISOString() };
    const d = shouldSend(sig, 3, last);
    expect(d.send).toBe(false);
    expect(d.reason).toMatch(/unchanged/);
  });

  it('re-sends when unchanged but the reminder interval elapsed', () => {
    process.env.PENDING_TASK_NOTIFY_REMINDER_HOURS = '24';
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const d = shouldSend(sig, 3, { signature: sig, sentAt: old });
    expect(d.send).toBe(true);
    expect(d.reason).toMatch(/reminder/);
  });
});
