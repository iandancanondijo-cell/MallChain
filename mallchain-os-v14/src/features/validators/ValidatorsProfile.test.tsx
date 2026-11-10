/**
 * My Application — the two halves of the validator rule on one screen.
 *
 * "Allowed" (an admin approved the application) and "staked" (a self-bond in
 * the chain's bonded set, plus an active reviewer bond) come from three
 * different reads: GET /api/validators/my-application returns the review
 * bookkeeping and onChainBonded, GET /api/validators/detail/:valoper returns
 * what the chain records for the address, and the reviewer profile returns the
 * MLPTS bond and whether BOTH halves are met. These pin that the page keeps
 * them apart — including the case where a read failed and the honest answer is
 * "unknown", not "no".
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ValidatorsProfile from './ValidatorsProfile';
import { store } from '../../store/store';
import { validatorsApi, type ValidatorApplication, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';
import { minesApi, type ReviewerProfile } from '../../services/minesApi';

vi.mock('../../services/validatorsApi', () => ({
  validatorsApi: { myApplication: vi.fn(), getDetail: vi.fn() },
}));
vi.mock('../../services/minesApi', () => ({
  minesApi: { getReviewerProfile: vi.fn() },
}));
// Nothing here mocks ../../services/validatorCreateTx on purpose. The page
// calls toValoperAddress while rendering, and a previous version of this
// suite stubbed it with a string splice — so the page stayed green in tests
// while crashing in the browser with a bech32 RangeError. Importing the real
// module keeps that crash inside this suite.

const ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

/** A node whose own text is exactly this — figures sit beside a unit span. */
const textIs = (want: string) => (_content: string, element: Element | null): boolean =>
  element?.textContent?.trim() === want;

const APP = (over: Partial<ValidatorApplication> = {}): ValidatorApplication => ({
  _id: 'app-1',
  applicantAddress: ADDRESS,
  validatorAddress: '',
  moniker: 'my-node',
  website: '',
  details: '',
  selfDelegationAmount: '500',
  denom: 'stake',
  status: 'approved',
  isActiveValidator: false,
  submittedAt: '2026-11-01T00:00:00.000Z',
  reviewedAt: '2026-11-03T00:00:00.000Z',
  reviewer: 'admin@mallchain.test',
  ...over,
});

const CHAIN_ROW = (over: Partial<ValidatorLeaderboardEntry> = {}): ValidatorLeaderboardEntry => ({
  operatorAddress: 'mallvaloper1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
  name: 'my-node',
  identity: '',
  website: '',
  details: '',
  commission: '10.00',
  totalStaked: 500_000,
  votingPower: 500_000_000_000,
  status: 'unbonded',
  uptime: null,
  missedBlocks: null,
  jailed: false,
  tokens: 500_000_000_000,
  reputationScore: 40,
  reputationBasis: 'stake share + commission (no signing record)',
  ...over,
});

const REVIEWER = (over: Partial<ReviewerProfile> = {}): ReviewerProfile => ({
  validator_id: 'reviewer-1',
  moniker: 'my-node',
  stakedAmount: 80,
  minRequiredStake: 50,
  stakeStatus: 'active',
  totalSlashed: 0,
  missedVoteStreak: 0,
  tasks_assigned: 3,
  tasks_voted: 2,
  tasks_approved: 1,
  tasks_rejected: 1,
  approval_rate: 50,
  response_rate: 66,
  avg_response_time_ms: 1000,
  mining_reputation: 55,
  total_earnings: 20,
  review_eligible: true,
  validator_allowed: true,
  ...over,
} as ReviewerProfile);

async function mount(opts: {
  application?: ValidatorApplication | null;
  onChainBonded?: boolean | null;
  detail?: ValidatorLeaderboardEntry | null;
  reviewer?: ReviewerProfile | null;
} = {}) {
  const { application = APP(), onChainBonded = true, detail = null, reviewer = REVIEWER() } = opts;
  vi.mocked(validatorsApi.myApplication).mockResolvedValue({
    ok: true,
    data: {
      application,
      ...(onChainBonded === null ? {} : { onChainBonded }),
    },
  } as never);
  vi.mocked(validatorsApi.getDetail).mockResolvedValue(
    detail === null ? ({ ok: false, code: 404, error: 'validator_not_found' } as never) : ({ ok: true, data: { validator: detail } } as never),
  );
  vi.mocked(minesApi.getReviewerProfile).mockResolvedValue(
    reviewer === null ? ({ ok: false, error: 'profile unavailable' } as never) : ({ ok: true, data: reviewer } as never),
  );
  render(<ValidatorsProfile />);
  await waitFor(() => expect(screen.getByText('Allowed by review')).toBeTruthy());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  store.reset();
  store.state.wallet.address = ADDRESS;
  store.commit();
});

describe('approved and bonded', () => {
  test('both halves met is stated as Validator, not as a status of its own', async () => {
    await mount();
    expect(screen.getAllByText(textIs('Bonded on-chain')).length).toBeGreaterThan(0);
    expect(screen.getByText(textIs('Bonded'))).toBeTruthy();
    expect(screen.getByText('Approved and staked, which is what assignment, voting and reviewer rewards check.')).toBeTruthy();
    expect(screen.getByText(textIs('Validator'))).toBeTruthy();
  });
});

describe('approved but never bonded', () => {
  test('offers the self-bond and says the chain does not know the validator yet', async () => {
    await mount({ onChainBonded: false, detail: null });
    expect(screen.getByText('Activate validator')).toBeTruthy();
    expect(screen.getByText(/No self-bond has landed for this address/)).toBeTruthy();
    expect(screen.getByText(textIs('Not created'))).toBeTruthy();
  });

  test('an approval alone is not a validator: the reviewer bond card says so', async () => {
    await mount({ reviewer: REVIEWER({ stakeStatus: 'unstaked', stakedAmount: 0, review_eligible: false, validator_allowed: true }) });
    expect(screen.getByText(/Below the 50 MLPTS minimum needed to be assigned reviews/)).toBeTruthy();
    expect(screen.getByText(textIs('Not yet'))).toBeTruthy();
    expect(screen.getByText(/Assignment requires an approved application AND an active reviewer bond/)).toBeTruthy();
  });
});

describe('bonded enough that the chain already has the validator', () => {
  test('a recorded but unbonded validator is not offered a second MsgCreateValidator', async () => {
    await mount({ onChainBonded: false, detail: CHAIN_ROW({ status: 'unbonded' }) });
    expect(screen.getByText(/MsgCreateValidator cannot be sent twice for the same address/)).toBeTruthy();
    expect(screen.queryByText('Activate validator')).toBeNull();
    expect(screen.getByText(textIs('unbonded'))).toBeTruthy();
  });

  test('a jailed validator says unjailing is what moves it into the bonded set', async () => {
    await mount({ onChainBonded: false, detail: CHAIN_ROW({ status: 'unbonded', jailed: true }) });
    expect(screen.getByText(/running your node, then unjailing it/)).toBeTruthy();
    expect(screen.getByText(/jailed for missing blocks/)).toBeTruthy();
  });
});

describe('when a read did not answer', () => {
  test('a read still in flight is not narrated as an unreachable chain', async () => {
    vi.mocked(validatorsApi.myApplication).mockReturnValue(new Promise(() => {}));
    vi.mocked(minesApi.getReviewerProfile).mockReturnValue(new Promise(() => {}));
    render(<ValidatorsProfile />);
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText(/The chain node was unreachable/)).toBeNull();
    expect(screen.queryByText('Re-check chain state')).toBeNull();
  });


  test('no onChainBonded figure is "unknown", never a "no"', async () => {
    await mount({ onChainBonded: null });
    expect(screen.getByText(/The chain node was unreachable, so whether this validator is bonded is unknown/)).toBeTruthy();
    expect(screen.getByText('Re-check chain state')).toBeTruthy();
    expect(screen.getByText(/it is not a "no"/)).toBeTruthy();
    expect(screen.queryByText('Activate validator')).toBeNull();
  });

  test('a null review_eligible is reported as unread, not as ineligible', async () => {
    await mount({ reviewer: REVIEWER({ review_eligible: null, validator_allowed: null }) });
    expect(screen.getByText(textIs('—'))).toBeTruthy();
    expect(screen.getByText(/The server could not read the approval list/)).toBeTruthy();
  });

  test('no application on file grants nothing, even with an active bond', async () => {
    await mount({ application: null, reviewer: REVIEWER({ review_eligible: false, validator_allowed: false }) });
    expect(screen.getByText('No application on file')).toBeTruthy();
    expect(screen.getByText(/Staking MLPTS without an approval gets you no review work/)).toBeTruthy();
    expect(screen.getByText(textIs('none on file'))).toBeTruthy();
  });
});

describe('an application that cannot be activated', () => {
  test('pending says nothing can be signed yet, rather than pointing at a missing button', async () => {
    await mount({ application: APP({ status: 'pending', reviewedAt: null, reviewer: '' }), onChainBonded: false });
    expect(screen.getByText(/none can be signed while the application is still awaiting an admin decision/)).toBeTruthy();
    expect(screen.queryByText('Activate validator')).toBeNull();
    expect(screen.queryByText(/Use Activate below/)).toBeNull();
  });

  test('rejected points at the approval, not at a button that will never appear', async () => {
    await mount({ application: APP({ status: 'rejected' }), onChainBonded: false });
    expect(screen.getByText(/an approval is needed before anything can be signed/)).toBeTruthy();
    expect(screen.queryByText('Activate validator')).toBeNull();
  });

  test('no application at all is not described as awaiting a decision', async () => {
    await mount({ application: null, onChainBonded: false });
    expect(screen.getByText(/There is no application on file, so there is nothing here to bond/)).toBeTruthy();
  });
});

describe('a stored address that is not bech32', () => {
  test('the section says what it could not read instead of throwing', async () => {
    // Wallet state written by an older build can hold a placeholder such as
    // "mall1preexisting0000000000000000000000000", which uses letters bech32
    // forbids. The operator address is derived while rendering, so that input
    // used to take the whole page into the app's error boundary.
    store.state.wallet.address = 'mall1preexisting0000000000000000000000000';
    store.commit();
    await mount({ onChainBonded: false });

    expect(screen.getByText(textIs('not derived'))).toBeTruthy();
    expect(screen.getByText(/operator address not derived/)).toBeTruthy();
    expect(validatorsApi.getDetail).not.toHaveBeenCalled();
    expect(screen.queryByText('Activate validator')).toBeNull();
  });
});
