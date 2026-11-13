/**
 * Smart Contracts — the two-party half: an owner offers a contract to a wallet
 * address, the account that has that address linked answers, and only an
 * acceptance gives it usage rights on the Mallchain side.
 *
 * These pin the parts that are easy to get wrong in prose rather than in code:
 * that an offers read which FAILED is never narrated as an empty inbox, that
 * accepting is described as a record and not as a signature, that the counter-
 * party cannot be talked into thinking the wasm itself changed hands, and that
 * the server's own reason is what appears when it refuses.
 *
 * Nothing here mocks a helper the page calls while rendering. wasmTx and the
 * mnemonic prompt are stubbed only so an accidental click cannot reach for the
 * network; the offer flow itself touches neither.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Contracts from './Contracts';
import { ToastHost } from '../../components/ui';
import { store } from '../../store/store';
import { contractsApi, type ContractRecord } from '../../services/contractsApi';

vi.mock('../../services/contractsApi', () => ({
  contractsApi: {
    list: vi.fn(),
    offers: vi.fn(),
    deploy: vi.fn(),
    interact: vi.fn(),
    broadcast: vi.fn(),
    remove: vi.fn(),
    share: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    revoke: vi.fn(),
  },
}));
vi.mock('../../services/wasmTx', () => ({
  deployContract: vi.fn(),
  executeContract: vi.fn(),
  WasmTxError: class extends Error {},
}));
vi.mock('../../services/mnemonicAccess', () => ({ requestMnemonic: vi.fn() }));

const ADDRESS = 'mall1qv8pjfp08fz4qkmxw97g0y5a4zemajw5d9nlcy';
const OWNER_ADDRESS = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const PEER_ADDRESS = 'mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336';

/** A node whose own text is exactly this — counts sit beside their labels. */
const textIs = (want: string) => (_content: string, element: Element | null): boolean =>
  element?.textContent?.trim() === want;

/** The first button inside `root` whose own text is exactly `want`. */
function inCard(root: HTMLElement, want: string): HTMLElement | null {
  const hits = Array.from(root.querySelectorAll('button')).filter((n) => n.textContent?.trim() === want);
  return (hits[0] as HTMLElement) ?? null;
}

const record = (over: Partial<ContractRecord> = {}): ContractRecord => ({
  _id: 'c-1',
  name: 'Escrow vault',
  type: 'wasm',
  code: 'escrow.v2.wasm',
  description: 'codeId: 41',
  address: 'mall1b453f626eb6a3bd6ab61ba04',
  // The backend stores null when nothing was broadcast, so a fixture that
  // claims an address has to carry the hash that put it there.
  txHash: 'A'.repeat(64),
  deployedAt: '2026-11-04T00:00:00.000Z',
  txs: 3,
  status: 'active',
  ...over,
});

/** What GET /api/contracts answers — the caller's own deployments. */
const OWN = (): ContractRecord[] => [
  record({ _id: 'own-open', name: 'Payment router', offerStatus: 'offered', counterpartyAddress: PEER_ADDRESS, offeredAt: '2026-11-06T00:00:00.000Z' }),
  record({ _id: 'own-never', name: 'Escrow vault' }),
  record({ _id: 'own-accepted', name: 'Treasury gate', offerStatus: 'accepted', counterpartyAddress: PEER_ADDRESS, respondedAt: '2026-11-07T00:00:00.000Z' }),
];

/** What GET /api/contracts/offers answers — contracts other accounts named. */
const IN_OFFERED = (): ContractRecord => record({
  _id: 'in-offered',
  name: 'Royalty splitter',
  address: 'mall1c0ffee0000000000000000000',
  txs: 1,
  ownerAddress: OWNER_ADDRESS,
  counterpartyAddress: ADDRESS,
  offerStatus: 'offered',
  offerNote: 'Splits the payout 70/30 — takes over from the old one.',
  offeredAt: '2026-11-08T00:00:00.000Z',
});

const IN_ACCEPTED = (): ContractRecord => record({
  _id: 'in-accepted',
  name: 'Distribution pool',
  address: 'mall1d00d0000000000000000000000',
  txs: 2,
  ownerAddress: OWNER_ADDRESS,
  counterpartyAddress: ADDRESS,
  offerStatus: 'accepted',
  offeredAt: '2026-11-02T00:00:00.000Z',
  respondedAt: '2026-11-03T00:00:00.000Z',
});

const IN = (): ContractRecord[] => [IN_OFFERED(), IN_ACCEPTED()];

async function mount(opts: { own?: ContractRecord[] | null; incoming?: ContractRecord[] | null; ownError?: string; inError?: string } = {}) {
  const {
    own = OWN(),
    incoming = IN(),
    ownError = 'contracts list unavailable',
    inError = 'the offers endpoint answered 500',
  } = opts;
  vi.mocked(contractsApi.list).mockResolvedValue(
    own === null ? ({ ok: false, error: ownError } as never) : ({ ok: true, data: own } as never),
  );
  vi.mocked(contractsApi.offers).mockResolvedValue(
    incoming === null ? ({ ok: false, error: inError } as never) : ({ ok: true, data: incoming } as never),
  );
  render(
    <>
      <ToastHost />
      <Contracts />
    </>,
  );
  await screen.findByText('Smart Contracts');
  return own;
}

/** The card whose <b> title is exactly this name. */
async function cardFor(name: string): Promise<HTMLElement> {
  const title = await screen.findByText(name);
  const card = title.closest('.card');
  if (!card) throw new Error(`${name} is not inside a card`);
  return card as HTMLElement;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(contractsApi.share).mockResolvedValue({ ok: true, data: record() } as never);
  vi.mocked(contractsApi.accept).mockResolvedValue({ ok: true, data: record({ offerStatus: 'accepted' }) } as never);
  vi.mocked(contractsApi.decline).mockResolvedValue({ ok: true, data: record({ offerStatus: 'declined' }) } as never);
  vi.mocked(contractsApi.revoke).mockResolvedValue({ ok: true, data: record({ offerStatus: 'revoked' }) } as never);
  store.reset();
  store.state.wallet.address = ADDRESS;
  store.commit();
});

describe('an offer waiting on your answer', () => {
  test('says who it came from, what was said, and that accepting signs nothing', async () => {
    await mount();
    const card = await cardFor('Royalty splitter');
    expect(card.textContent).toContain(`From ${OWNER_ADDRESS} · offered to ${ADDRESS}`);
    expect(card.textContent).toContain('Splits the payout 70/30');
    expect(card.textContent).toContain('Accept contract');
    expect(card.textContent).toContain('Decline');
    expect(card.textContent).toContain('It does not change the contract on chain and moves no funds');
    expect(card.textContent).toContain('the wasm still only obeys signed transactions');
  });

  test('accepting is posted for that contract and both lists are re-read', async () => {
    await mount();
    const card = await cardFor('Royalty splitter');
    fireEvent.click(inCard(card, 'Accept contract') as HTMLElement);
    await waitFor(() => expect(contractsApi.accept).toHaveBeenCalledWith('in-offered'));
    await waitFor(() => expect(contractsApi.list.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(contractsApi.offers.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText('Accepted Royalty splitter')).toBeTruthy();
  });

  test('declining is its own route and is never narrated as deleting the contract', async () => {
    await mount();
    const card = await cardFor('Royalty splitter');
    fireEvent.click(inCard(card, 'Decline') as HTMLElement);
    await waitFor(() => expect(contractsApi.decline).toHaveBeenCalledWith('in-offered'));
    expect(contractsApi.remove).not.toHaveBeenCalled();
    expect(await screen.findByText('Declined Royalty splitter')).toBeTruthy();
  });

  test('the server refusing an acceptance is shown in its own words', async () => {
    vi.mocked(contractsApi.accept).mockResolvedValue({ ok: false, error: 'this offer is revoked, so there is nothing to accept' } as never);
    await mount();
    const card = await cardFor('Royalty splitter');
    fireEvent.click(inCard(card, 'Accept contract') as HTMLElement);
    expect(await screen.findByText(/this offer is revoked, so there is nothing to accept/)).toBeTruthy();
    expect(screen.queryByText('Accepted Royalty splitter')).toBeNull();
  });

  test('one you already accepted is an Execute card, not an Accept card', async () => {
    await mount();
    const card = await cardFor('Distribution pool');
    expect(card.textContent).toContain(`Offered by ${OWNER_ADDRESS}`);
    expect(inCard(card, 'Execute')).toBeTruthy();
    expect(inCard(card, 'Accept contract')).toBeNull();
  });

  test('a declined offer leaves the inbox instead of sitting there greyed out', async () => {
    await mount({ incoming: [record({ _id: 'in-declined', name: 'Old splitter', offerStatus: 'declined', counterpartyAddress: ADDRESS, ownerAddress: OWNER_ADDRESS })] });
    await screen.findByText('Deployed by you');
    expect(screen.queryByText('Old splitter')).toBeNull();
    expect(screen.queryByText('Accept contract')).toBeNull();
  });
});

describe('the offers read itself', () => {
  test('a failed read keeps its own slot and claims nothing', async () => {
    await mount({ incoming: null, inError: 'the offers endpoint answered 500' });
    expect(await screen.findByText(/the offers endpoint answered 500/)).toBeTruthy();
    expect(screen.getByText('This is a read that failed, not an empty inbox — an offer may still be waiting.')).toBeTruthy();
    expect(screen.getByText('Re-check offers')).toBeTruthy();
    expect(screen.queryByText('No contracts shared with you')).toBeNull();
    // Both offer counts stay unknown rather than being rounded down to zero.
    expect(screen.getAllByText(textIs('—')).length).toBe(2);
    expect(screen.getByText('The offers could not be read, so nothing is being claimed about them.')).toBeTruthy();
  });

  test('a re-check re-reads the offers', async () => {
    await mount({ incoming: null });
    const before = contractsApi.offers.mock.calls.length;
    fireEvent.click(await screen.findByText('Re-check offers'));
    await waitFor(() => expect(contractsApi.offers.mock.calls.length).toBeGreaterThan(before));
  });

  test('a genuinely empty inbox says nothing appears by itself', async () => {
    await mount({ incoming: [] });
    expect(await screen.findByText('No contracts shared with you')).toBeTruthy();
    expect(screen.getByText(/Nothing appears here by itself/)).toBeTruthy();
    expect(screen.queryByText('Re-check offers')).toBeNull();
    expect(screen.getAllByText(textIs('0')).length).toBe(2);
  });

  test('a failed own-contracts read is not reported as zero deployments', async () => {
    await mount({ own: null });
    expect(await screen.findByText('contracts list unavailable')).toBeTruthy();
    expect(screen.getByText('This list could not be read, so the count is unknown — not zero.')).toBeTruthy();
    expect(screen.queryByText('No contracts deployed yet')).toBeNull();
  });
});

describe('the summary cards', () => {
  test('each count states the field it is read from', async () => {
    await mount();
    expect(screen.getByText('Deployed by you')).toBeTruthy();
    expect(screen.getByText('contracts · userId = you')).toBeTruthy();
    expect(screen.getByText('contracts · counterpartyUserId = you · offerStatus')).toBeTruthy();
    expect(screen.getByText('contracts · offerStatus = accepted')).toBeTruthy();
    // 3 own, 1 waiting on an answer, 1 already accepted.
    expect(screen.getByText(textIs('3'))).toBeTruthy();
    expect(screen.getAllByText(textIs('1')).length).toBe(2);
  });

  test('with nothing accepted yet the card says acceptance is what unlocks use', async () => {
    await mount({ incoming: [IN_OFFERED()] });
    await cardFor('Royalty splitter');
    expect(screen.getByText('Accepting is what lets you use someone else’s contract. Nothing is handed to you without your answer.')).toBeTruthy();
  });

  test('an accepted contract is described as executable with your own key', async () => {
    await mount({ incoming: [IN_ACCEPTED()] });
    await cardFor('Distribution pool');
    expect(screen.getByText('These you may execute from your own key, the way the owner can.')).toBeTruthy();
  });
});

describe('an offer you sent', () => {
  test('an open offer is stated as waiting, with change and withdraw available', async () => {
    await mount();
    const card = await cardFor('Payment router');
    expect(card.textContent).toContain(`Offered to ${PEER_ADDRESS}`);
    expect(card.textContent).toContain('Nothing about the contract changes until they accept');
    expect(inCard(card, 'Change offer')).toBeTruthy();
    expect(inCard(card, 'Withdraw offer')).toBeTruthy();
  });

  test('withdrawing calls revoke for that contract only', async () => {
    await mount();
    const card = await cardFor('Payment router');
    fireEvent.click(inCard(card, 'Withdraw offer') as HTMLElement);
    await waitFor(() => expect(contractsApi.revoke).toHaveBeenCalledWith('own-open'));
    expect(await screen.findByText('Offer withdrawn')).toBeTruthy();
  });

  test('a contract never shared offers the share route and says nothing about an answer', async () => {
    await mount();
    const card = await cardFor('Escrow vault');
    expect(inCard(card, 'Share')).toBeTruthy();
    expect(card.textContent).not.toMatch(/Offered to|Accepted by|Declined by|withdrawn/);
  });

  test('one they accepted is recorded as accepted, not as a change of hands', async () => {
    await mount();
    const card = await cardFor('Treasury gate');
    expect(card.textContent).toContain(`Accepted by ${PEER_ADDRESS}`);
    expect(card.textContent).toContain('accepting signed no transaction');
    expect(inCard(card, 'Withdraw offer')).toBeNull();
  });

  test('an answered offer is a settled fact: no control that could only be refused', async () => {
    await mount();
    const card = await cardFor('Treasury gate');
    expect(inCard(card, 'Share')).toBeNull();
    expect(inCard(card, 'Change offer')).toBeNull();
    expect(card.textContent).toContain('their answer is a settled fact');
    expect(card.textContent).toContain('Deploying a new instance is how the same code is handed to someone else');
  });
});

describe('a record with nothing on-chain behind it', () => {
  // The backend refuses to invent an address it cannot verify, so a record can
  // come back with address/txHash null. The page has to show that as a state
  // rather than as a blank field or a plausible-looking string.
  test('says it was never deployed instead of guessing an address', async () => {
    await mount({
      own: [record({ _id: 'own-draft', name: 'Settlement draft', address: null, txHash: null, txs: 0 }), ...OWN()],
    });
    const card = await cardFor('Settlement draft');
    expect(card.textContent).toContain('not deployed on-chain');
    expect(card.textContent).toContain('No instantiation transaction behind this record');
    expect(card.textContent).not.toMatch(/0x[0-9a-f]/i);
    expect(inCard(card, 'Execute')).toBeNull();
    // Offering it is a Mallchain-side record, so that stays available.
    expect(inCard(card, 'Share')).toBeTruthy();
  });

  test('an accepted offer with no instance says what cannot be done instead of showing a dead button', async () => {
    await mount({
      incoming: [record({
        _id: 'in-draft',
        name: 'Paperwork only',
        address: null,
        txHash: null,
        txs: 0,
        offerStatus: 'accepted',
        counterpartyAddress: ADDRESS,
        ownerAddress: OWNER_ADDRESS,
      })],
    });
    const card = await cardFor('Paperwork only');
    expect(inCard(card, 'Execute')).toBeNull();
    expect(card.textContent).toContain('nothing here to execute until its owner deploys one');
  });
});

describe('the share dialog', () => {
  test('names what the address decides and states a shared contract is not public', async () => {
    await mount();
    fireEvent.click(inCard(await cardFor('Escrow vault'), 'Share') as HTMLElement);
    expect(await screen.findByText('Wallet address to offer it to')).toBeTruthy();
    expect(screen.getByText(/A shared contract is not public/)).toBeTruthy();
    expect(screen.getByText(/Their acceptance is stored by Mallchain against their own account, and it is not a signature/)).toBeTruthy();
  });

  test('sending an offer posts the address and the note, then re-reads', async () => {
    await mount();
    fireEvent.click(inCard(await cardFor('Escrow vault'), 'Share') as HTMLElement);
    fireEvent.change(screen.getByPlaceholderText('mall1…'), { target: { value: PEER_ADDRESS } });
    fireEvent.change(screen.getByPlaceholderText('What this contract is for'), { target: { value: 'Takes over the old splitter.' } });
    fireEvent.click(screen.getByText('Send offer'));
    await waitFor(() => expect(contractsApi.share).toHaveBeenCalledWith('own-never', PEER_ADDRESS, 'Takes over the old splitter.'));
    expect(await screen.findByText(`Offered to ${PEER_ADDRESS} — they have to accept it themselves`)).toBeTruthy();
  });

  test('an offer the server rejects is shown verbatim, modal still open', async () => {
    vi.mocked(contractsApi.share).mockResolvedValue({ ok: false, error: 'no Mallchain account has that wallet address linked' } as never);
    await mount();
    fireEvent.click(inCard(await cardFor('Escrow vault'), 'Share') as HTMLElement);
    fireEvent.change(screen.getByPlaceholderText('mall1…'), { target: { value: PEER_ADDRESS } });
    fireEvent.click(screen.getByText('Send offer'));
    expect(await screen.findByText(/no Mallchain account has that wallet address linked/)).toBeTruthy();
    expect(screen.queryByText(/they have to accept it themselves/)).toBeNull();
    expect(screen.getByPlaceholderText('mall1…')).toBeTruthy();
  });

  test('a stale client re-sharing an answered offer is refused in the servers words', async () => {
    // The page no longer offers this control; the refusal is here so an older
    // tab cannot silently overwrite a decision that was already recorded.
    vi.mocked(contractsApi.share).mockResolvedValue({ ok: false, error: 'this contract is already accepted — sharing it again would overwrite that' } as never);
    await mount();
    fireEvent.click(inCard(await cardFor('Payment router'), 'Change offer') as HTMLElement);
    fireEvent.change(screen.getByPlaceholderText('mall1…'), { target: { value: PEER_ADDRESS } });
    fireEvent.click(screen.getByText('Send offer'));
    expect(await screen.findByText(/already accepted — sharing it again would overwrite that/)).toBeTruthy();
  });

  test('a withdrawn offer can be pointed at someone else again', async () => {
    await mount({
      own: [record({ _id: 'own-revoked', name: 'Settlement rail', offerStatus: 'revoked', counterpartyAddress: PEER_ADDRESS, respondedAt: '2026-11-08T00:00:00.000Z' }), ...OWN()],
    });
    const card = await cardFor('Settlement rail');
    expect(card.textContent).toContain('Offer withdrawn');
    expect(inCard(card, 'Share')).toBeTruthy();
  });

  test('an empty address is refused before anything is sent', async () => {
    await mount();
    fireEvent.click(inCard(await cardFor('Escrow vault'), 'Share') as HTMLElement);
    fireEvent.click(screen.getByText('Send offer'));
    expect(contractsApi.share).not.toHaveBeenCalled();
    expect(await screen.findByText('Enter the wallet address to share with')).toBeTruthy();
  });
});

describe('calling a contract someone else deployed', () => {
  test('the dialog says the contract’s own permissions decide the call', async () => {
    await mount();
    fireEvent.click(inCard(await cardFor('Distribution pool'), 'Execute') as HTMLElement);
    await screen.findByText(/Sends a MsgExecuteContract to/);
    expect(screen.getByText(/You are calling as the account it was offered to/)).toBeTruthy();
  });

  test('your own contract does not borrow that sentence', async () => {
    await mount({ incoming: [] });
    fireEvent.click(inCard(await cardFor('Escrow vault'), 'Execute') as HTMLElement);
    await screen.findByText(/Sends a MsgExecuteContract to/);
    expect(screen.queryByText(/You are calling as the account it was offered to/)).toBeNull();
  });
});

describe('without a linked wallet', () => {
  test('the page gates on the wallet and shows no counts', async () => {
    store.state.wallet.address = '';
    store.commit();
    render(<Contracts />);
    await waitFor(() => expect(contractsApi.list).toHaveBeenCalled());
    expect(screen.getByText('No wallet connected')).toBeTruthy();
    expect(screen.queryByText('Shared with you')).toBeNull();
    expect(screen.queryByText('Deployed by you')).toBeNull();
  });
});
