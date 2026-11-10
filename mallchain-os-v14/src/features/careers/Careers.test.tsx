import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import Careers from './Careers';
import { OpeningDetail } from './OpeningDetail';
import { careersApi, EMPTY_SPEC, type JobOpening, type BoardResult, type MyApplication } from '../../services/careersApi';
import { kycApi } from '../../services/kycApi';
import { store } from '../../store/store';
import type { Verification } from './useVerification';

vi.mock('./careers.css', () => ({}));
vi.mock('../../services/kycApi', () => ({ kycApi: { getStatus: vi.fn() } }));
vi.mock('../../services/careersApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/careersApi')>();
  return {
    ...actual,
    careersApi: {
      options: vi.fn(), board: vi.fn(), mine: vi.fn(), get: vi.fn(), create: vi.fn(),
      update: vi.fn(), remove: vi.fn(), apply: vi.fn(), applicationsFor: vi.fn(),
      myApplications: vi.fn(), answer: vi.fn(), withdraw: vi.fn(),
    },
  };
});

const api = vi.mocked(careersApi);
const getStatus = vi.mocked(kycApi.getStatus);

const OPTIONS = {
  workspaces: ['Engineering', 'Design'], fields: ['Blockchain', 'Frontend'],
  educationLevels: ['none', 'bachelors'], seniorities: ['mid', 'senior'],
  employmentTypes: ['full_time', 'contract'], workModes: ['remote', 'hybrid', 'onsite'],
  payPeriods: ['hour', 'month', 'year'],
} as const;

function opening(over: Partial<JobOpening> = {}): JobOpening {
  return {
    ...EMPTY_SPEC,
    id: 'op1', authorId: 'author1', authorName: 'ada',
    title: 'Senior Protocol Engineer', workspace: 'Engineering', field: 'Blockchain',
    description: 'Own the settlement path that turns a signed transaction into a final balance.',
    responsibilities: ['Own the settlement module'], requirements: ['Three years of Go or Rust'],
    skills: ['Rust', 'Cosmos SDK'], preferredSkills: ['Formal verification'], benefits: ['Remote-first'],
    educationLevel: 'bachelors', experienceYears: 3, seniority: 'senior', employmentType: 'full_time',
    workMode: 'remote', location: 'Nairobi or remote', positions: 2,
    payMin: 1200, payMax: 2000, payCurrency: 'USD', payPeriod: 'month',
    equity: '0.1% over four years', applicationInstructions: 'Tell us about a consensus bug you found.',
    deadline: null, status: 'open', applicationsCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

function board(openings: JobOpening[], over: Partial<BoardResult> = {}): BoardResult {
  return {
    openings, total: openings.length, limit: 20, offset: 0,
    availableWorkspaces: [...new Set(openings.map((o) => o.workspace))],
    availableFields: [...new Set(openings.map((o) => o.field))],
    ...over,
  };
}

const VERIFIED: Verification = { state: 'verified', verified: true, message: '', action: null, refresh: () => {} };

/** The board reads options, the board itself, and the caller's own two lists. */
function stubReads(openings: JobOpening[], mine: JobOpening[] = [], sent: MyApplication[] = []) {
  api.options.mockResolvedValue({ ok: true, data: OPTIONS as never });
  api.board.mockResolvedValue({ ok: true, data: board(openings) });
  api.mine.mockResolvedValue({ ok: true, data: mine });
  api.myApplications.mockResolvedValue({ ok: true, data: sent });
}

async function mount(user: { kycLevel?: number; role?: string; authed?: boolean } = {}) {
  Object.assign(store.state.user, { id: 'viewer1', role: 'user', kycLevel: 1, authed: true }, user);
  const view = render(<Careers />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return view;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);
});

describe('Careers board', () => {
  test('an empty board says it is empty and offers the one action that changes it', async () => {
    stubReads([]);
    await mount();
    expect(screen.getByText('No openings on the board yet')).toBeTruthy();
    expect(screen.getByText('Every role here is published by a verified account. If you are hiring, post the first one.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Post an opening' }).length).toBeGreaterThan(0);
  });

  test('a role card carries the spec a reader needs to decide', async () => {
    stubReads([opening()]);
    await mount();
    expect(screen.getByText('Senior Protocol Engineer')).toBeTruthy();
    expect(screen.getByText('Engineering · Blockchain')).toBeTruthy();
    expect(screen.getByText(/1,200 – 2,000 USD \/ month/)).toBeTruthy();
    expect(screen.getByText(/3\+ yrs/)).toBeTruthy();
    expect(screen.getByText("Bachelor's degree")).toBeTruthy();
    expect(screen.getByText('Rust')).toBeTruthy();
    expect(screen.getByText(/Posted by ada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  test('a role with no stated pay says so rather than inventing a number', async () => {
    stubReads([opening({ payMin: null, payMax: null, equity: '' })]);
    await mount();
    expect(screen.getByText('Pay not stated')).toBeTruthy();
  });

  test('my own posting on the board does not offer Apply', async () => {
    stubReads([opening({ mine: true })], [opening({ mine: true })]);
    await mount();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Your posting' })).toBeTruthy();
  });

  test('the workspace filter offers only what is actually hiring', async () => {
    stubReads([opening()]);
    await mount();
    const select = screen.getByLabelText('Workspace') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'Engineering']);
  });

  test('searching sends the trimmed term to the server, not a request per keystroke', async () => {
    stubReads([opening()]);
    await mount();
    const callsAfterMount = api.board.mock.calls.length;
    const input = screen.getByLabelText('Search openings');
    fireEvent.change(input, { target: { value: '  consensus  ' } });
    expect(api.board.mock.calls.length).toBe(callsAfterMount);
    await waitFor(() => expect(api.board.mock.calls.length).toBeGreaterThan(callsAfterMount), { timeout: 1500 });
    expect(api.board.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'consensus' });
  });

  test('a failed board read is an error, not an empty board', async () => {
    api.options.mockResolvedValue({ ok: true, data: OPTIONS as never });
    api.board.mockResolvedValue({ ok: false, error: 'Could not reach the server' });
    api.mine.mockResolvedValue({ ok: true, data: [] });
    api.myApplications.mockResolvedValue({ ok: true, data: [] });
    await mount();
    expect(screen.getByRole('alert').textContent).toContain('Could not reach the server');
    expect(screen.queryByText('No openings on the board yet')).toBeNull();
  });

  test('load more appends rather than replacing the page', async () => {
    stubReads([opening()], [], []);
    api.board.mockResolvedValue({ ok: true, data: board([opening()], { total: 2 }) });
    await mount();
    api.board.mockResolvedValue({ ok: true, data: board([opening({ id: 'op2', title: 'Designer' })], { total: 2, offset: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
    await waitFor(() => expect(screen.getByText('Designer')).toBeTruthy());
    expect(screen.getByText('Senior Protocol Engineer')).toBeTruthy();
  });
});

describe('Careers verification gate', () => {
  test('an unverified account can read the board but cannot post', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { status: 'not_submitted' } } as never);
    stubReads([opening()]);
    await mount();
    expect(screen.getByText('Senior Protocol Engineer')).toBeTruthy();
    expect(screen.getByText('Verified accounts post and apply')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start verification' })).toBeTruthy();
    for (const b of screen.getAllByRole('button', { name: 'Post an opening' })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  test('a pending review says what it is waiting for', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { status: 'pending' } } as never);
    stubReads([]);
    await mount();
    expect(screen.getByText(/documents are with a reviewer/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View verification status' })).toBeTruthy();
  });

  test('a rejection offers resubmission, not a generic nag', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { status: 'rejected' } } as never);
    stubReads([]);
    await mount();
    expect(screen.getByText(/was rejected. Re-submit your documents/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review and resubmit' })).toBeTruthy();
  });

  test('an unreadable verdict leaves the board readable and offers a retry', async () => {
    getStatus.mockResolvedValue({ ok: false, error: 'offline' } as never);
    stubReads([opening()]);
    await mount();
    expect(screen.getByText('Senior Protocol Engineer')).toBeTruthy();
    expect(screen.getByText(/could not read your verification status/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  test('kycLevel 2 is verified without a status read', async () => {
    stubReads([]);
    await mount({ kycLevel: 2 });
    expect(getStatus).not.toHaveBeenCalled();
    expect(screen.queryByText('Verified accounts post and apply')).toBeNull();
    expect((screen.getAllByRole('button', { name: 'Post an opening' })[0] as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('OpeningDetail application', () => {
  const detail = (o: JobOpening, verification = VERIFIED) => {
    api.get.mockResolvedValue({ ok: true, data: o });
    return render(<OpeningDetail openingId={o.id} verification={verification} onClose={() => {}} onApplied={() => {}} />);
  };

  test('the whole specification is shown, including what to include when applying', async () => {
    detail(opening());
    await waitFor(() => expect(screen.getByText('About the role')).toBeTruthy());
    expect(screen.getByText('Own the settlement module')).toBeTruthy();
    expect(screen.getByText('Three years of Go or Rust')).toBeTruthy();
    expect(screen.getByText('Remote-first')).toBeTruthy();
    expect(screen.getByText('Tell us about a consensus bug you found.')).toBeTruthy();
    expect(screen.getByText('0.1% over four years')).toBeTruthy();
    expect(screen.getByText(/Your message goes to ada as a notification/)).toBeTruthy();
  });

  test('a message under 20 characters cannot be sent', async () => {
    detail(opening());
    await waitFor(() => expect(screen.getByLabelText('Your message to the author')).toBeTruthy());
    const box = screen.getByLabelText('Your message to the author');
    fireEvent.change(box, { target: { value: 'Too short' } });
    expect((screen.getByRole('button', { name: /Send application/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.apply).not.toHaveBeenCalled();
  });

  test('sending delivers the message and reports who it went to', async () => {
    api.apply.mockResolvedValue({ ok: true, data: { authorName: 'ada' } as never });
    const onApplied = vi.fn();
    api.get.mockResolvedValue({ ok: true, data: opening() });
    render(<OpeningDetail openingId="op1" verification={VERIFIED} onClose={() => {}} onApplied={onApplied} />);
    await waitFor(() => expect(screen.getByLabelText('Your message to the author')).toBeTruthy());
    const message = 'I have run validators for three years and shipped two Cosmos modules.';
    fireEvent.change(screen.getByLabelText('Your message to the author'), { target: { value: message } });
    api.get.mockResolvedValue({ ok: true, data: opening({ myApplication: { id: 'a1', status: 'submitted', message, createdAt: '2026-11-10T00:00:00.000Z' } }) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send application/ })); });
    expect(api.apply).toHaveBeenCalledWith('op1', message);
    expect(onApplied).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Your application')).toBeTruthy());
    expect(screen.getByText('Awaiting a response')).toBeTruthy();
    expect(screen.getByText(/The author was notified when you applied/)).toBeTruthy();
  });

  test('a server refusal is shown verbatim, not swallowed', async () => {
    api.apply.mockResolvedValue({ ok: false, error: 'You have already applied to this opening' });
    detail(opening());
    await waitFor(() => expect(screen.getByLabelText('Your message to the author')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Your message to the author'), { target: { value: 'I have run validators for three years.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send application/ })); });
    expect(screen.getByRole('alert').textContent).toContain('You have already applied to this opening');
  });

  test('the author is told where applications go, not offered an Apply box', async () => {
    detail(opening({ mine: true }));
    await waitFor(() => expect(screen.getByText(/You posted this opening/)).toBeTruthy());
    expect(screen.queryByLabelText('Your message to the author')).toBeNull();
  });

  test('an unverified reader gets the gate instead of the message box', async () => {
    detail(opening(), { state: 'unverified', verified: false, message: 'Verify your identity to post an opening or apply to one.', action: { label: 'Start verification', href: '#/kyc' }, refresh: () => {} });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Start verification' })).toBeTruthy());
    expect(screen.queryByLabelText('Your message to the author')).toBeNull();
  });

  test('a closed opening says why there is no Apply box', async () => {
    detail(opening({ status: 'closed' }));
    await waitFor(() => expect(screen.getByText(/no longer accepting applications/)).toBeTruthy());
    expect(screen.queryByLabelText('Your message to the author')).toBeNull();
  });

  test('a passed deadline is named, not silently ignored', async () => {
    detail(opening({ deadline: '2020-01-01T00:00:00.000Z' }));
    await waitFor(() => expect(screen.getByText(/has passed/)).toBeTruthy());
    expect(screen.queryByLabelText('Your message to the author')).toBeNull();
  });

  test('an application already sent is shown with its status instead of a second box', async () => {
    detail(opening({ myApplication: { id: 'a1', status: 'shortlisted', message: 'My background is in consensus.', createdAt: '2026-11-02T00:00:00.000Z' } }));
    await waitFor(() => expect(screen.getByText('Your application')).toBeTruthy());
    expect(screen.getByText('Shortlisted')).toBeTruthy();
    expect(screen.getByText('My background is in consensus.')).toBeTruthy();
    expect(screen.queryByLabelText('Your message to the author')).toBeNull();
  });
});