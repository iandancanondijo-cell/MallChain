/**
 * The developer-key panel.
 *
 * A key here is not decorative: the backend authenticates it, counts its calls
 * and revokes it for real. These pin that the panel shows the server's own
 * numbers, never invents a permission the chain does not enforce, keeps a secret
 * masked until it is asked for, and refuses to revoke without a confirmation.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiKeys } from './ApiKeys';
import { ToastHost } from '../../components/ui';
import { devhubApi, type DevApiKey, type UsageStats } from '../../services/devhubApi';

vi.mock('./devhub.css', () => ({}));
vi.mock('../../services/devhubApi', () => ({
  displayApiBase: () => 'http://127.0.0.1:4000',
  devhubApi: {
    listKeys: vi.fn(),
    usage: vi.fn(),
    createKey: vi.fn(),
    renameKey: vi.fn(),
    revokeKey: vi.fn(),
    testKey: vi.fn(),
  },
}));

const api = vi.mocked(devhubApi);
const confirmMock = vi.fn<(message?: string) => boolean>();

const KEY_A: DevApiKey = {
  _id: 'k1', name: 'price-bot', key: 'mk_' + 'a'.repeat(64),
  permissions: ['read'], used: 120, created: '2026-10-01T10:00:00.000Z',
  lastUsed: '2026-11-09T08:30:00.000Z', revoked: false,
};
const KEY_B: DevApiKey = {
  _id: 'k2', name: 'analytics', key: 'mk_' + 'b'.repeat(64),
  permissions: ['read'], used: 7, created: '2026-11-05T10:00:00.000Z',
  lastUsed: null, revoked: false,
};
const USAGE: UsageStats = {
  totalRequests: 1284, keysActive: 2, keysTotal: 5,
  usage: [
    { keyId: 'k1', keyName: 'price-bot', total: 120, lastUsed: '2026-11-09T08:30:00.000Z' },
    { keyId: 'k2', keyName: 'analytics', total: 7, lastUsed: null },
  ],
  lastUpdated: '2026-11-09T09:00:00.000Z',
};

const card = (name: string) => within(screen.getByText(name).closest('.dh-key') as HTMLElement);
const names = () => Array.from(document.querySelectorAll('.dh-key-name')).map((n) => n.textContent);
const newKeyInput = () => screen.getByLabelText('New API key name') as HTMLInputElement;

function mount(onTryKey = vi.fn(), onCount = vi.fn()) {
  return render(
    <>
      <ApiKeys onTryKey={onTryKey} onCount={onCount} />
      <ToastHost />
    </>,
  );
}

async function settled() {
  await waitFor(() => expect(screen.queryByText('Loading your keys…')).toBeNull());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window, 'confirm', { value: confirmMock, configurable: true, writable: true });
  confirmMock.mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  api.listKeys.mockResolvedValue({ ok: true, data: [KEY_B, KEY_A] });
  api.usage.mockResolvedValue({ ok: true, data: USAGE });
});

describe('the numbers are the server’s', () => {
  test('usage facts come from the usage endpoint, including revoked keys it never lists', async () => {
    mount();
    await settled();
    expect(screen.getByText('1,284')).toBeTruthy();
    const fact = (label: string) => screen.getByText(label).parentElement?.textContent || '';
    expect(fact('Active keys')).toContain('2');
    expect(fact('Revoked')).toContain('3');
    expect(fact('Permission')).toContain('read');
    expect(fact('Rate limit')).toContain('120 / min / key');
    expect(api.usage).toHaveBeenCalledTimes(1);
  });

  test('the call count beside a key is the server’s counter, not a local guess', async () => {
    mount();
    await settled();
    expect(card('price-bot').getByText('120 calls')).toBeTruthy();
    expect(card('analytics').getByText('7 calls')).toBeTruthy();
  });

  test('one recorded call reads as one call, not one calls', async () => {
    api.listKeys.mockResolvedValue({ ok: true, data: [{ ...KEY_B, name: 'solo', used: 1 }] });
    mount();
    await settled();
    expect(card('solo').getByText('1 call')).toBeTruthy();
    expect(card('solo').queryByText('1 calls')).toBeNull();
  });

  test('the usage bar is relative to the busiest key', async () => {
    mount();
    await settled();
    const fill = (name: string) => (screen.getByText(name).closest('.dh-key') as HTMLElement).querySelector('.dh-usage-fill') as HTMLElement;
    expect(fill('price-bot').style.width).toBe('100%');
    expect(fill('analytics').style.width).toBe('6%');
  });

  test('a failed load says so and Retry really loads again', async () => {
    api.listKeys.mockResolvedValueOnce({ ok: false, error: 'Session expired' });
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Session expired'));
    expect(screen.queryByText('price-bot')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await waitFor(() => expect(screen.getByText('price-bot')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('no keys yet is an empty state that explains the header, not a fake row', async () => {
    api.listKeys.mockResolvedValue({ ok: true, data: [] });
    api.usage.mockResolvedValue({ ok: true, data: { ...USAGE, totalRequests: 0, keysActive: 0, keysTotal: 0, usage: [] } });
    const onCount = vi.fn();
    mount(vi.fn(), onCount);
    await settled();
    expect(screen.getByText('No API keys yet')).toBeTruthy();
    expect(document.querySelectorAll('.dh-key').length).toBe(0);
    expect(document.querySelector('.empty-state')?.textContent).toContain('x-api-key');
    expect(onCount).toHaveBeenCalledWith(0);
  });

  test('the parent is told the real count, so the tab badge cannot drift', async () => {
    const onCount = vi.fn();
    mount(vi.fn(), onCount);
    await settled();
    expect(onCount).toHaveBeenCalledWith(2);
  });
});

describe('the panel promises only what is enforced', () => {
  test('there is no scope picker, because the backend enforces exactly read', async () => {
    mount();
    await settled();
    expect(screen.getAllByRole('combobox').length).toBe(1);
    expect(screen.getByLabelText('Sort keys')).toBeTruthy();
    expect(screen.queryByLabelText(/scope/i)).toBeNull();
    expect(screen.queryByText('write')).toBeNull();
    expect(screen.queryByText('admin')).toBeNull();
  });

  test('creating sends a name and nothing else — no client-invented permissions', async () => {
    api.createKey.mockResolvedValue({ ok: true, data: { ...KEY_B, _id: 'k3', name: ' indexer ', key: 'mk_' + 'c'.repeat(64), used: 0 } });
    mount();
    await settled();
    fireEvent.change(newKeyInput(), { target: { value: 'indexer' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create key' })); });
    expect(api.createKey).toHaveBeenCalledTimes(1);
    expect(api.createKey).toHaveBeenCalledWith('indexer');
    expect(api.createKey.mock.calls[0].length).toBe(1);
  });

  test('the cURL example carries a placeholder, never one of your real keys', async () => {
    mount();
    await settled();
    const block = document.querySelector('.code-block pre') as HTMLElement;
    expect(block.textContent).toContain('x-api-key: mk_…');
    expect(block.textContent).not.toContain(KEY_A.key);
    expect(block.textContent).toContain('/api/devhub/v1/status');
  });

  test('the guidance says to use the header, not the URL', async () => {
    mount();
    await settled();
    expect(screen.getByText(/never in the URL/)).toBeTruthy();
    expect(screen.getByText(/cannot create or revoke keys/)).toBeTruthy();
  });
});

describe('creating a key', () => {
  test('an empty name cannot be submitted', async () => {
    mount();
    await settled();
    expect((screen.getByRole('button', { name: 'Create key' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(newKeyInput(), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Create key' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(newKeyInput(), { target: { value: 'price-bot-2' } });
    expect((screen.getByRole('button', { name: 'Create key' }) as HTMLButtonElement).disabled).toBe(false);
    expect(api.createKey).not.toHaveBeenCalled();
  });

  test('Enter in the name field creates the key', async () => {
    api.createKey.mockResolvedValue({ ok: true, data: KEY_B });
    mount();
    await settled();
    fireEvent.change(newKeyInput(), { target: { value: 'from-enter' } });
    await act(async () => { fireEvent.keyDown(newKeyInput(), { key: 'Enter' }); });
    expect(api.createKey).toHaveBeenCalledWith('from-enter');
  });

  test('a new key is revealed in full once, and the field is cleared', async () => {
    const fresh: DevApiKey = { ...KEY_B, _id: 'k3', name: 'fresh', key: 'mk_' + 'd'.repeat(64), used: 0 };
    api.createKey.mockResolvedValue({ ok: true, data: fresh });
    api.listKeys
      .mockResolvedValueOnce({ ok: true, data: [KEY_B, KEY_A] })
      .mockResolvedValue({ ok: true, data: [fresh, KEY_B, KEY_A] });
    mount();
    await settled();
    fireEvent.change(newKeyInput(), { target: { value: 'fresh' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create key' })); });
    expect(newKeyInput().value).toBe('');
    expect(screen.getByText(/copy it now/)).toBeTruthy();
    await waitFor(() => expect(card('fresh').getByText(fresh.key)).toBeTruthy());
    expect(card('price-bot').queryByText(KEY_A.key)).toBeNull();
    expect(api.listKeys.mock.calls.length).toBeGreaterThan(1);
  });

  test('a rejected create keeps what you typed and reports the server’s reason', async () => {
    api.createKey.mockResolvedValue({ ok: false, error: 'You have reached the 20-key limit. Revoke one first.' });
    mount();
    await settled();
    fireEvent.change(newKeyInput(), { target: { value: 'one-too-many' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create key' })); });
    expect(screen.getByText(/20-key limit/)).toBeTruthy();
    expect(newKeyInput().value).toBe('one-too-many');
  });
});

describe('the secret stays secret until asked', () => {
  test('a listed key is masked, and Reveal shows exactly that key', async () => {
    mount();
    await settled();
    const row = card('price-bot');
    expect(row.queryByText(KEY_A.key)).toBeNull();
    expect(row.getByText(/^mk_aaa•{18}aaaa$/)).toBeTruthy();
    fireEvent.click(row.getByRole('button', { name: 'Reveal' }));
    expect(row.getByText(KEY_A.key)).toBeTruthy();
    fireEvent.click(row.getByRole('button', { name: 'Hide' }));
    expect(row.queryByText(KEY_A.key)).toBeNull();
  });

  test('revealing one key does not reveal another', async () => {
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Reveal' }));
    expect(card('analytics').queryByText(KEY_B.key)).toBeNull();
  });

  test('Copy puts the real key on the clipboard even while it is masked', async () => {
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(KEY_A.key));
    expect(screen.getByText('Key copied')).toBeTruthy();
  });

  test('a blocked clipboard tells you to reveal and copy by hand', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByText(/reveal the key and copy it by hand/)).toBeTruthy());
  });
});

describe('testing, renaming and revoking', () => {
  test('Test key sends the key itself and reports the counter the server returned', async () => {
    api.testKey.mockResolvedValue({ ok: true, data: { valid: true, keyName: 'price-bot', permissions: ['read'], used: 121 } });
    mount();
    await settled();
    await act(async () => { fireEvent.click(card('price-bot').getByRole('button', { name: 'Test key' })); });
    expect(api.testKey).toHaveBeenCalledWith(KEY_A.key);
    expect(screen.getByText('price-bot: valid · 121 calls recorded')).toBeTruthy();
  });

  test('a rejected key is reported as rejected, never as valid', async () => {
    api.testKey.mockResolvedValue({ ok: false, error: 'Invalid or revoked API key' });
    mount();
    await settled();
    await act(async () => { fireEvent.click(card('price-bot').getByRole('button', { name: 'Test key' })); });
    expect(screen.getByText('Invalid or revoked API key')).toBeTruthy();
    expect(screen.queryByText(/valid ·/)).toBeNull();
  });

  test('one call is recorded as one call, not pluralised wrongly', async () => {
    api.testKey.mockResolvedValue({ ok: true, data: { valid: true, keyName: 'analytics', permissions: ['read'], used: 1 } });
    mount();
    await settled();
    await act(async () => { fireEvent.click(card('analytics').getByRole('button', { name: 'Test key' })); });
    expect(screen.getByText('analytics: valid · 1 call recorded')).toBeTruthy();
  });

  test('Rename saves on Enter and shows the server’s stored name', async () => {
    api.renameKey.mockResolvedValue({ ok: true, data: { ...KEY_A, name: 'price-bot-eu' } });
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Rename price-bot');
    expect((field as HTMLInputElement).value).toBe('price-bot');
    fireEvent.change(field, { target: { value: 'price-bot-eu' } });
    await act(async () => { fireEvent.keyDown(field, { key: 'Enter' }); });
    expect(api.renameKey).toHaveBeenCalledWith('k1', 'price-bot-eu');
    expect(screen.getByText('price-bot-eu')).toBeTruthy();
    expect(screen.queryByLabelText('Rename price-bot')).toBeNull();
  });

  test('Escape abandons a rename without calling the server', async () => {
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Rename price-bot');
    fireEvent.change(field, { target: { value: 'discard me' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(api.renameKey).not.toHaveBeenCalled();
    expect(screen.getByText('price-bot')).toBeTruthy();
  });

  test('an empty rename is refused before any request', async () => {
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Rename price-bot');
    fireEvent.change(field, { target: { value: '  ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(api.renameKey).not.toHaveBeenCalled();
    expect(screen.getByText('A key name cannot be empty')).toBeTruthy();
  });

  test('renaming to the same name closes the editor without a request', async () => {
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Rename' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(api.renameKey).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  test('a failed rename leaves the old name on screen', async () => {
    api.renameKey.mockResolvedValue({ ok: false, error: 'Key not found' });
    mount();
    await settled();
    fireEvent.click(card('price-bot').getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Rename price-bot'), { target: { value: 'gone' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(screen.getByText('Key not found')).toBeTruthy();
    expect(screen.getByLabelText('Rename price-bot')).toBeTruthy();
  });

  test('Revoke asks first, naming the key and saying it cannot be undone', async () => {
    confirmMock.mockReturnValue(false);
    mount();
    await settled();
    await act(async () => { fireEvent.click(card('price-bot').getByRole('button', { name: 'Revoke' })); });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0][0])).toContain('price-bot');
    expect(String(confirmMock.mock.calls[0][0])).toContain('cannot be undone');
    expect(api.revokeKey).not.toHaveBeenCalled();
    expect(screen.getByText('price-bot')).toBeTruthy();
  });

  test('a confirmed revoke removes the row immediately', async () => {
    api.revokeKey.mockResolvedValue({ ok: true, data: { revoked: true } });
    api.listKeys.mockResolvedValue({ ok: true, data: [KEY_B, KEY_A] });
    mount();
    await settled();
    api.listKeys.mockResolvedValue({ ok: true, data: [KEY_B] });
    await act(async () => { fireEvent.click(card('price-bot').getByRole('button', { name: 'Revoke' })); });
    expect(api.revokeKey).toHaveBeenCalledWith('k1');
    await waitFor(() => expect(screen.queryByText('price-bot')).toBeNull());
    expect(screen.getByText('analytics')).toBeTruthy();
  });

  test('a failed revoke keeps the key listed, because it still works', async () => {
    api.revokeKey.mockResolvedValue({ ok: false, error: 'Database unavailable' });
    mount();
    await settled();
    await act(async () => { fireEvent.click(card('price-bot').getByRole('button', { name: 'Revoke' })); });
    expect(screen.getByText('Database unavailable')).toBeTruthy();
    expect(screen.getByText('price-bot')).toBeTruthy();
  });

  test('Try an endpoint hands the whole key to the parent', async () => {
    const onTryKey = vi.fn();
    mount(onTryKey);
    await settled();
    fireEvent.click(card('analytics').getByRole('button', { name: 'Try an endpoint' }));
    expect(onTryKey).toHaveBeenCalledWith(KEY_B);
  });
});

describe('finding and ordering', () => {
  test('search narrows by name and Clear brings the list back', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('Search API keys'), { target: { value: 'analy' } });
    expect(names()).toEqual(['analytics']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(names().length).toBe(2);
  });

  test('a search with no match says so rather than showing an empty panel', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('Search API keys'), { target: { value: 'nothing-like-this' } });
    expect(document.querySelectorAll('.dh-key').length).toBe(0);
    expect(screen.getByText(/No key matches/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }));
    expect(names().length).toBe(2);
  });

  test('the three sorts really reorder the rows', async () => {
    mount();
    await settled();
    const sort = screen.getByLabelText('Sort keys');
    expect(names()).toEqual(['analytics', 'price-bot']);
    fireEvent.change(sort, { target: { value: 'used' } });
    expect(names()).toEqual(['price-bot', 'analytics']);
    fireEvent.change(sort, { target: { value: 'name' } });
    expect(names()).toEqual(['analytics', 'price-bot']);
    fireEvent.change(sort, { target: { value: 'newest' } });
    expect(names()).toEqual(['analytics', 'price-bot']);
  });

  test('a key never used says never, not a fabricated date', async () => {
    mount();
    await settled();
    expect(card('analytics').getByText('last used never')).toBeTruthy();
  });
});