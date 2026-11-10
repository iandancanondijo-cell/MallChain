/**
 * Earnings screen tests.
 *
 * Two rules hold this panel together. The first is structural: every figure is
 * a card that explains itself — value, what it counts, and where it came from —
 * because a bare "12" on an earnings screen gets read as whatever the viewer
 * hoped for. The second is the owner's comparison: tasks that appeared on the
 * user's window against tasks they actually did, drawn as both bars and lines
 * from server records (campaign_impressions, task_submissions). A day with
 * nothing in it must still be drawn, and a figure the server never reported
 * must read as unknown rather than as zero — an unmeasured day and an idle day
 * are different claims, and the difference is what the chart is for.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MinesEarnings from './MinesEarnings';
import { minesApi, type EarningsSummary } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: { getEarningsSummary: vi.fn() },
}));

function summary(over: Partial<EarningsSummary> = {}): EarningsSummary {
  return {
    currency: 'MLPTS',
    approvedCount: 3,
    approvedMlpts: 45.88,
    rejectedCount: 1,
    pendingCount: 2,
    pendingMlptsAtStake: 12,
    pendingCampaignsUnresolved: 0,
    thisWeekMlpts: 15,
    avgRewardMlpts: 15.293,
    daily: [],
    balanceMlpts: 400,
    tasksCompleted: 3,
    source: 'task_submissions',
    ...over,
  };
}

/** Seven UTC days, mostly empty on purpose: the empty ones are under test. */
const activity = (todayShown: number, todayDone: number) => ([
  { date: '2026-11-04', shown: 0, opened: 0, done: 0, paid_count: 0, paid_mlpts: 0 },
  { date: '2026-11-05', shown: 0, opened: 0, done: 0, paid_count: 0, paid_mlpts: 0 },
  { date: '2026-11-06', shown: 0, opened: 1, done: 1, paid_count: 0, paid_mlpts: 0 },
  { date: '2026-11-07', shown: 0, opened: 0, done: 0, paid_count: 0, paid_mlpts: 0 },
  { date: '2026-11-08', shown: 0, opened: 0, done: 0, paid_count: 0, paid_mlpts: 0 },
  { date: '2026-11-09', shown: 0, opened: 0, done: 0, paid_count: 1, paid_mlpts: 15 },
  { date: '2026-11-10', shown: todayShown, opened: 0, done: todayDone, paid_count: 0, paid_mlpts: 0 },
]);

describe('MinesEarnings cards', () => {
  beforeEach(() => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: activity(4, 1), impressions_since: '2026-11-04' }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  // The structural rule: no card is allowed to be only a number.
  test('every figure carries its own definition and its own provenance', async () => {
    render(<MinesEarnings />);
    await screen.findByText('Earned from campaigns');

    const cards = Array.from(document.querySelectorAll('.earn-card'));
    expect(cards.length).toBeGreaterThanOrEqual(10);
    for (const card of cards) {
      expect(card.querySelector('.lbl')).not.toBeNull();
      expect(card.querySelector('.num')).not.toBeNull();
      expect(card.querySelector('.def')?.textContent?.trim().length).toBeGreaterThan(10);
      expect(card.querySelector('.src')?.textContent?.trim().length).toBeGreaterThan(3);
    }
  });

  test('the settled money is separated from the money still with reviewers', async () => {
    render(<MinesEarnings />);
    expect(await screen.findByText('45.88')).toBeInTheDocument();
    expect(screen.getByText(/worth up to 12 MLPTS if the panel approves them/)).toBeInTheDocument();
    expect(screen.getByText(/The attempt is closed and no Mallpoints moved/)).toBeInTheDocument();
  });

  test('the balance card refuses to be read as campaign earnings', async () => {
    render(<MinesEarnings />);
    expect(await screen.findByText(/not only tasks/)).toBeInTheDocument();
  });

  test('the week\'s offer and the week\'s work are stated as separate figures', async () => {
    render(<MinesEarnings />);
    await screen.findByText('On your window this week');
    expect(screen.getByText(/Distinct campaigns Discover actually showed you/)).toBeInTheDocument();
    expect(screen.getByText(/Only a submitted screenshot can be paid/)).toBeInTheDocument();
    expect(screen.getByText(/counted since/)).toBeInTheDocument();
    // 4 appeared today and 2 submissions went in across the window: the card
    // that divides them must show the ratio the server's rows support.
    expect(screen.getByText('Screen to action')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});

describe('MinesEarnings screen-vs-action charts', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  test('one comparison is drawn as bars and as lines, from the same two series', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: activity(4, 1), impressions_since: '2026-11-04' }),
    });
    render(<MinesEarnings />);
    await screen.findByText('Tasks shown against tasks done');

    expect(screen.getAllByText('Appeared on your window')).toHaveLength(2);
    expect(screen.getAllByText('You did')).toHaveLength(2);

    // Seven days, two bars each — a day nothing happened is still a bar, so
    // "the screen was full and you did nothing" stays visible.
    expect(document.querySelectorAll('.chart-group')).toHaveLength(7);
    expect(document.querySelectorAll('.chart-group .chart-bar')).toHaveLength(14);
    // Two trend lines over the same axis, plus the reward-paid line below.
    expect(document.querySelectorAll('svg polyline')).toHaveLength(3);
  });

  test('the reward-paid counter is tied to the window the charts draw', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: activity(4, 1), impressions_since: '2026-11-04' }),
    });
    render(<MinesEarnings />);
    expect(await screen.findByText(/4 appeared on your window · 2 you did/)).toBeInTheDocument();
    expect(screen.getByText(/15 MLPTS paid across 1 approved task/)).toBeInTheDocument();
  });

  test('a server that never recorded impressions is told, not plotted as zeros', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: undefined, impressions_since: undefined }),
    });
    render(<MinesEarnings />);
    await screen.findByText('Earned from campaigns');

    expect(screen.getAllByText(/does not report what appeared on your Discover/)).toHaveLength(2);
    expect(document.querySelectorAll('.chart-group')).toHaveLength(0);

    const unknown = Array.from(document.querySelectorAll('.earn-card'))
      .filter((card) => card.querySelector('.num')?.textContent?.trim().startsWith('—'));
    expect(unknown).toHaveLength(3);
    expect(screen.getByText('not measured by this server')).toBeInTheDocument();
    // The settled money is still reported in full.
    expect(screen.getByText('45.88')).toBeInTheDocument();
  });

  test('nothing shown this week is not reported as 0% effort', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: activity(0, 0), impressions_since: null }),
    });
    render(<MinesEarnings />);
    await screen.findByText('Screen to action');

    const card = Array.from(document.querySelectorAll('.earn-card'))
      .find((c) => c.querySelector('.lbl')?.textContent === 'Screen to action');
    expect(card?.querySelector('.num')?.textContent).toContain('—');
    expect(screen.getByText(/nothing to divide by/)).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
    // Counting exists but has served this account nothing yet.
    expect(screen.getByText(/no shared history yet/)).toBeInTheDocument();
  });

  test('proofs that predate the offer counter are never divided into a 500% ratio', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({
      ok: true,
      data: summary({ activity: activity(1, 5), impressions_since: '2026-11-10' }),
    });
    render(<MinesEarnings />);
    await screen.findByText('Screen to action');

    expect(screen.queryByText('500%')).toBeNull();
    expect(screen.getByText(/the ratio cannot be computed yet/)).toBeInTheDocument();
    expect(screen.getByText(/more proofs than recorded offers/)).toBeInTheDocument();
    // The raw counts are still plotted — the counters disagree, the data does not.
    expect(screen.getByText('On your window this week')).toBeInTheDocument();
  });

  test('an unreadable summary retries rather than showing an empty earnings screen', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({ ok: false, error: 'earnings unavailable' });
    render(<MinesEarnings />);
    expect(await screen.findByText(/earnings unavailable/)).toBeInTheDocument();
    expect(screen.getByText('Earnings unavailable')).toBeInTheDocument();
    expect(document.querySelectorAll('.earn-card')).toHaveLength(0);
  });
});
