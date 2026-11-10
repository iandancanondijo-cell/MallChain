/**
 * Validator leaderboard truth tests.
 *
 * The board is a read of the chain, not of the admin panel: it lists only the
 * BOND_STATUS_BONDED set (validatorCenterService.js), and a validator whose
 * slashing signing record could not be read arrives with uptime null. The two
 * things these pin are that null is never drawn as a flattering 100%, and that
 * the summary cards average only over rows the chain actually reported.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ValidatorsLeaderboard from './ValidatorsLeaderboard';
import { validatorsApi, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';

vi.mock('../../services/validatorsApi', () => ({
  validatorsApi: { leaderboard: vi.fn() },
}));

/** A node whose own text is exactly this figure. Figures sit next to a unit
 * span ("1.7M" + "MALL"), so the default matcher splits them in two. */
const textIs = (want: string) => (_content: string, element: Element | null): boolean =>
  element?.textContent?.trim() === want;

const ROW = (over: Partial<ValidatorLeaderboardEntry> = {}): ValidatorLeaderboardEntry => ({
  operatorAddress: 'mallvaloper1nairobi0qz6h2v9m4xk7t3sr8pd5ycja2lq0',
  name: 'Nairobi Node',
  identity: '',
  website: '',
  details: '',
  commission: '5.00',
  totalStaked: 1_200_000,
  votingPower: 1_200_000_000_000,
  status: 'bonded',
  uptime: 98.8,
  missedBlocks: 12,
  jailed: false,
  tokens: 1_200_000_000_000,
  reputationScore: 81,
  reputationBasis: 'uptime + stake share + commission',
  ...over,
});

async function mount(rows: ValidatorLeaderboardEntry[]) {
  vi.mocked(validatorsApi.leaderboard).mockResolvedValue({ ok: true, data: { validators: rows } } as never);
  render(<ValidatorsLeaderboard />);
  await waitFor(() => expect(screen.getByText('Nairobi Node')).toBeTruthy());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the metric cards', () => {
  test('count bonded rows and say what the board leaves out', async () => {
    await mount([ROW(), ROW({ operatorAddress: 'mallvaloper1coastal', name: 'Coastal' })]);
    expect(screen.getByText('Validators listed')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/Applicants who were approved but never bonded/)).toBeTruthy();
    expect(screen.getByText(/status=BOND_STATUS_BONDED/)).toBeTruthy();
  });

  test('sum the stake behind the listed validators without claiming a chain share', async () => {
    await mount([ROW(), ROW({ operatorAddress: 'b', name: 'Coastal Validator', totalStaked: 500_000 })]);
    expect(screen.getByText('Stake behind them')).toBeTruthy();
    expect(screen.getByText(/It is not a share of the chain/)).toBeTruthy();
    // 1,200,000 + 500,000 — the card totals the listed rows; no other figure
    // on the page is that sum.
    expect(screen.getByText(textIs('1.70M MALL'))).toBeTruthy();
  });

  test('report how many bonded validators are jailed right now', async () => {
    await mount([ROW({ jailed: true })]);
    expect(screen.getByText('Jailed right now')).toBeTruthy();
    expect(screen.getByText(/1 of 1 are jailed/)).toBeTruthy();
  });
});

describe('uptime the chain did not report', () => {
  test('a row with no signing record reads "not reported", never 100%', async () => {
    await mount([ROW(), ROW({ operatorAddress: 'q', name: 'Quorum Lab', uptime: null, missedBlocks: null, reputationBasis: 'stake share + commission (no signing record)' })]);
    expect(screen.getByText('uptime not reported')).toBeTruthy();
    expect(screen.queryByText('100.0% uptime')).toBeNull();
  });

  test('the average covers only readable rows and says how many were left out', async () => {
    await mount([
      ROW({ uptime: 100 }),
      ROW({ operatorAddress: 'c', name: 'Coastal', uptime: 90 }),
      ROW({ operatorAddress: 'q', name: 'Quorum Lab', uptime: null, missedBlocks: null }),
    ]);
    // (100 + 90) / 2 — including the unreadable row as a zero would print 63.3%.
    expect(screen.getByText('95.0%')).toBeTruthy();
    expect(screen.getByText(/2 validators whose signing record was readable/)).toBeTruthy();
    expect(screen.getByText(/1 could not be read and are left out of this average/)).toBeTruthy();
  });

  test('with no readable signing record at all there is no average, not even a zero', async () => {
    await mount([ROW({ uptime: null, missedBlocks: null })]);
    expect(screen.getByText(/No validator here has a signing record the chain would share/)).toBeTruthy();
  });

  test('the footnote names the rows whose score was rebuilt without uptime', async () => {
    await mount([ROW({ uptime: null, missedBlocks: null })]);
    expect(screen.getByText(/built from stake share and commission alone/)).toBeTruthy();
  });
});

describe('an empty or unreachable bonded set', () => {
  test('no bonded validators is stated as the chain reporting an empty set', async () => {
    vi.mocked(validatorsApi.leaderboard).mockResolvedValue({ ok: true, data: { validators: [] } } as never);
    render(<ValidatorsLeaderboard />);
    await waitFor(() => expect(screen.getByText('No bonded validators')).toBeTruthy());
    expect(screen.getByText(/after its own signed self-bond enters the bonded set/)).toBeTruthy();
    expect(screen.queryByText('Validators listed')).toBeNull();
  });

  test('a failed read offers a retry instead of an empty board', async () => {
    vi.mocked(validatorsApi.leaderboard).mockResolvedValue({ ok: false, error: 'chain node unreachable' } as never);
    render(<ValidatorsLeaderboard />);
    await waitFor(() => expect(screen.getByText(/chain node unreachable/)).toBeTruthy());
    expect(screen.getByText('Leaderboard unavailable')).toBeTruthy();
    expect(screen.getByText('[Retry]')).toBeTruthy();
  });
});
