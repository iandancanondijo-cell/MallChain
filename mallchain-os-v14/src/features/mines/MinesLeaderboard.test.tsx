/**
 * Leaderboard money-figure tests.
 *
 * The board ranks Campaign Participants by Mallpoints a panel actually approved
 * (backend/src/routes/mines.js: GET /leaderboard), and every row now carries a
 * second, smaller figure: what that Mallpoints is worth. That conversion is the
 * security-critical part — Mallpoints has no price of its own, so the number
 * must come from the one live rate the wallet uses (hooks/useLivePrice.ts →
 * GET /api/economy/state) and must disappear, not fall back to a guess, when
 * that rate is missing. These also pin the second rule: the board is a top-50
 * list, so a miner's own lifetime total is read from their settled submissions
 * (GET /earnings/summary) rather than inferred from whether a row exists.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import MinesLeaderboard from './MinesLeaderboard';
import { store } from '../../store/store';
import { minesApi } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: {
    campaignLeaderboard: vi.fn(),
    getProfile: vi.fn(),
    getEarningsSummary: vi.fn(),
  },
}));

/** Mutable so one test can hand the component a rate and the next can take it away. */
const livePrice = { pointPriceKes: 2, loading: false, error: false };
vi.mock('../../hooks/useLivePrice', () => ({
  useLivePrice: () => ({ ...livePrice, midKes: 0.63, buyKes: null, sellKes: null, conversionRate: null }),
}));
// KES in, KES out — the FX cross itself is tested in services/currency.
vi.mock('../../services/currency', () => ({
  useCurrencyConverter: () => (amount: number | null) => (amount === null ? null : amount),
}));

const ENTRY = (over: Record<string, unknown> = {}) => ({
  id: 'a2f73349b9c4464552faec93',
  name: 'miner-one',
  earned: 1200,
  tasks: 40,
  rankPoints: 0,
  ...over,
});

const profile = { id: 'a2f73349b9c4464552faec93', mlpts_balance: 400 };
const summary = { approvedMlpts: 1200, approvedCount: 40 };

async function mount(rows: unknown[], earnings: unknown = { ...summary }) {
  vi.mocked(minesApi.campaignLeaderboard).mockResolvedValue({ ok: true, data: rows } as never);
  vi.mocked(minesApi.getProfile).mockResolvedValue({ ok: true, data: profile } as never);
  vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({ ok: true, data: earnings } as never);
  const view = render(<MinesLeaderboard />);
  await waitFor(() => expect(screen.getByText('miner-one')).toBeTruthy());
  return view;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  livePrice.pointPriceKes = 2;
  livePrice.error = false;
  store.reset();
  // The rows assert "KES" digits; the default detection would follow the
  // test runner's locale and format them as dollars instead.
  store.state.prefs.currency = 'KES';
});

describe('the Mallpoints figure', () => {
  test('every ranked row shows the Mallpoints a panel approved', async () => {
    await mount([ENTRY()]);
    // The same figure appears twice by design: the row and your own total card.
    expect(screen.getAllByText('1.2k').length).toBeGreaterThan(1);
    expect(screen.getByText(/40 tasks completed/)).toBeTruthy();
  });

  test('your total is Mallpoints made, stated from your own settled rewards', async () => {
    await mount([ENTRY()]);
    expect(screen.getByText('Mallpoints you have made')).toBeTruthy();
    expect(screen.getByText(/across 40 completed campaign tasks/)).toBeTruthy();
    expect(screen.getByText('task_submissions · settled rewards')).toBeTruthy();
  });
});

describe('the small money figure', () => {
  test('converts at the live Mallpoints rate rather than a baked-in number', async () => {
    await mount([ENTRY({ earned: 1200 })]);
    // 1200 MLPTS x 2 KES = KSh 2,400 — and the rate itself is named.
    expect(screen.getAllByText(/2,400/).length).toBeGreaterThan(0);
    expect(screen.getByText(/live Mallpoints rate of/)).toBeTruthy();
    expect(screen.getByText(/economy\/state · pointPriceKes/)).toBeTruthy();
  });

  test('says the rate moved the figure, and is not mistaken for a payout', async () => {
    livePrice.pointPriceKes = 3;
    await mount([ENTRY({ earned: 1200 })]);
    expect(screen.getAllByText(/3,600/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not an amount anyone can withdraw/)).toBeTruthy();
  });

  test('prints no money digits when the rate has not loaded', async () => {
    livePrice.pointPriceKes = null;
    await mount([ENTRY()]);
    expect(screen.getAllByText('rate unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('No rate, so no money figure is printed.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2,400|≈ K/);
  });

  test('distinguishes an unreachable rate feed from one still loading', async () => {
    livePrice.pointPriceKes = null;
    livePrice.error = true;
    await mount([ENTRY()]);
    expect(screen.getAllByText('rate feed unreachable').length).toBeGreaterThan(0);
  });
});

describe('a total the ranked rows cannot tell you', () => {
  test('a miner below the top of the board still gets their own total', async () => {
    // The profile matches no row, so rank is unknown — but earnings are not.
    await mount([ENTRY({ id: 'other', name: 'miner-one', earned: 9000 })]);
    expect(screen.getByText(/9k/)).toBeTruthy();
    expect(screen.getByText('Mallpoints you have made')).toBeTruthy();
    expect(screen.getByText(/You have earned rewards but are not in the rows above/)).toBeTruthy();
    expect(screen.queryByText(/not in the ranked list yet/)).toBeNull();
  });

  test('an account with nothing approved says so instead of showing a zero total as a rank', async () => {
    await mount([ENTRY({ id: 'other', name: 'miner-one' })], { approvedMlpts: 0, approvedCount: 0 });
    expect(screen.getByText(/You are not in the ranked list yet/)).toBeTruthy();
    expect(screen.getByText(/are not part of it|not part of it/)).toBeTruthy();
  });
});
