/**
 * Analytics flow tests.
 *
 * The screen turns GET /api/mines/earnings/summary's `activity` rows into a
 * four-stage funnel — offered, opened, proof sent, approved — because only the
 * last stage pays and the gap between stages is the thing a participant can
 * actually act on. That makes the denominators the subject under test rather
 * than decoration: a stage that is larger than the one before it means the
 * offer counter started later than the history it is being compared against, so
 * the screen must refuse to call that a drop-off rate (backend/src/routes/
 * mines.js: recordImpressions alongside GET /campaigns/available, and
 * /earnings/summary). These also pin the two ways "not measured" differs from
 * "zero", and that an approval rate is never printed without a decided
 * submission to divide by.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import MinesAnalytics from './MinesAnalytics';
import { minesApi, type EarningsSummary } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: {
    getEarningsSummary: vi.fn(),
    mySubmissions: vi.fn(),
  },
}));

const utcDay = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

const row = (back: number, over: Record<string, number> = {}) => ({
  date: utcDay(back), shown: 0, opened: 0, done: 0, paid_count: 0, paid_mlpts: 0, ...over,
});

function summary(over: Partial<EarningsSummary> = {}): EarningsSummary {
  return {
    currency: 'MLPTS',
    approvedCount: 3,
    approvedMlpts: 45,
    rejectedCount: 1,
    pendingCount: 2,
    pendingMlptsAtStake: 30,
    pendingCampaignsUnresolved: 0,
    thisWeekMlpts: 15,
    avgRewardMlpts: 15,
    daily: [row(1), row(0)],
    balanceMlpts: 400,
    tasksCompleted: 4,
    source: 'task_submissions',
    activity: [row(6), row(5), row(4), row(3), row(2), row(1), row(0)],
    impressions_since: utcDay(6),
    ...over,
  } as EarningsSummary;
}

async function mount(earnings: EarningsSummary) {
  vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({ ok: true, data: earnings } as never);
  vi.mocked(minesApi.mySubmissions).mockResolvedValue({ ok: true, data: [] } as never);
  const view = render(<MinesAnalytics />);
  await waitFor(() => expect(screen.getByText('How your tasks move')).toBeTruthy());
  return view;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the four stages of a task', () => {
  test('each stage is its own packed card, naming where its number comes from', async () => {
    await mount(summary({
      activity: [row(1, { shown: 4, opened: 2, done: 2, paid_count: 1, paid_mlpts: 15 }), row(0, { shown: 2, opened: 1, done: 0 })],
    }));
    for (const label of ['Offered on your window', 'Links opened', 'Proofs sent', 'Approved and paid']) {
      const card = screen.getByText(label).parentElement as HTMLElement;
      expect(card.querySelector('.num')?.textContent?.trim()).toBeTruthy();
      expect(card.querySelector('.def')?.textContent?.trim().length).toBeGreaterThan(20);
      expect(card.querySelector('.src')?.textContent?.trim()).toBeTruthy();
    }
    expect(screen.getByText('campaign_impressions · since', { exact: false }).textContent).toMatch(/since /);
  });

  test('plots every stage on one chart so the drop is visible', async () => {
    await mount(summary({
      activity: [row(0, { shown: 6, opened: 3, done: 2, paid_count: 1 })],
    }));
    expect(screen.getByText('Your flow of task completion')).toBeTruthy();
    const groups = document.querySelectorAll('.chart-group');
    expect(groups.length).toBe(4);
    expect(screen.getByLabelText(/Offered 6/)).toBeTruthy();
    expect(screen.getByText('Most tasks are lost between offered and opened — 6 offered, 3 opened, a gap of 3.')).toBeTruthy();
  });

  test('names the largest gap rather than the first one it finds', async () => {
    await mount(summary({
      activity: [row(0, { shown: 8, opened: 7, done: 2, paid_count: 2 })],
    }));
    expect(screen.getByText(/lost between opened and proof sent — 7 opened, 2 proofs sent, a gap of 5/)).toBeTruthy();
  });

  test('says nothing dropped out when each stage carried to the next', async () => {
    await mount(summary({
      activity: [row(0, { shown: 3, opened: 3, done: 3, paid_count: 3 })],
    }));
    expect(screen.getByText(/Nothing dropped out/)).toBeTruthy();
    expect(screen.queryByText(/lost between/)).toBeNull();
  });

  test('refuses a gap when more proofs than offers fall in the window', async () => {
    await mount(summary({
      activity: [row(0, { shown: 1, opened: 0, done: 5, paid_count: 1 })],
    }));
    expect(screen.getByText(/not comparable yet/)).toBeTruthy();
    expect(screen.queryByText(/lost between/)).toBeNull();
    expect(screen.queryByText(/gap of -/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/a gap of -/);
  });
});

describe('a server that records less than this screen needs', () => {
  test('an unrecorded offer count is a gap in the story, not a zero', async () => {
    await mount(summary({ activity: [row(0, { shown: 0, opened: 4, done: 4, paid_count: 2 })], impressions_since: null }));
    const offered = screen.getByText('Offered on your window').parentElement as HTMLElement;
    expect(offered.querySelector('.num')?.textContent?.trim()).toBe('—');
    expect(offered.querySelector('.src')?.textContent).toContain('not recorded');
    expect(screen.getByText(/does not record what it offered you/)).toBeTruthy();
    // Three stages, not four: the funnel drops the stage that has no source.
    expect(document.querySelectorAll('.chart-group').length).toBe(3);
    expect(screen.queryByText(/gap of 4/)).toBeNull();
  });

  test('no activity rows at all leaves the trend unplotted instead of flatlining it', async () => {
    await mount(summary({ activity: [] }));
    expect(screen.getByText(/returns no daily activity for the window/)).toBeTruthy();
    expect(document.querySelectorAll('svg polyline').length).toBe(0);
  });
});

describe('what reviewers decided', () => {
  test('the approval rate is a share of decided submissions only', async () => {
    await mount(summary({ approvedCount: 3, rejectedCount: 1, pendingCount: 2 }));
    const rate = screen.getByText('Approval rate').parentElement as HTMLElement;
    expect(rate.querySelector('.num')?.textContent).toContain('75.0%');
    expect(rate.querySelector('.def')?.textContent).toContain('Open submissions count neither way.');
    expect(screen.getByText('3 approved, 1 refused, 2 still awaiting a vote.')).toBeTruthy();
  });

  test('prints no rate at all before the first decision', async () => {
    await mount(summary({ approvedCount: 0, rejectedCount: 0, pendingCount: 2, avgRewardMlpts: 0, approvedMlpts: 0 }));
    const rate = screen.getByText('Approval rate').parentElement as HTMLElement;
    expect(rate.querySelector('.num')?.textContent?.trim()).toBe('—');
    expect(rate.querySelector('.def')?.textContent).toContain('Needs at least one decided submission');
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  test('pairs proofs with approvals as lines so the review lag is readable', async () => {
    await mount(summary({ activity: [row(1, { done: 3, paid_count: 1 }), row(0, { done: 1, paid_count: 2 })] }));
    expect(screen.getByText('Proofs sent against rewards paid')).toBeTruthy();
    expect(document.querySelectorAll('svg polyline').length).toBe(2);
    expect(screen.getByText('Proofs you sent')).toBeTruthy();
    expect(screen.getByText('Approved and paid by a panel')).toBeTruthy();
  });
});

describe('when the summary does not load', () => {
  test('says so and draws no cards', async () => {
    vi.mocked(minesApi.getEarningsSummary).mockResolvedValue({ ok: false, error: 'mines offline' } as never);
    vi.mocked(minesApi.mySubmissions).mockResolvedValue({ ok: true, data: [] } as never);
    render(<MinesAnalytics />);
    await waitFor(() => expect(screen.getByText(/mines offline/)).toBeTruthy());
    expect(document.querySelectorAll('.earn-card').length).toBe(0);
    fireEvent.click(screen.getByText('[Retry]'));
    expect(minesApi.getEarningsSummary).toHaveBeenCalledTimes(2);
  });
});
