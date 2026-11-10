/**
 * The endpoint explorer.
 *
 * The list is read from GET /api/devhub/docs, not typed into the component, and
 * "Send request" returns a real status, latency and body. These pin that a 401
 * and a 502 are shown as what they are, that a route needing a key cannot be sent
 * without one, and that a copied cURL command hides the secret unless asked.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Endpoints } from './Endpoints';
import { ToastHost } from '../../components/ui';
import { devhubApi, type DevApiKey, type DevDocs, type EndpointResponse } from '../../services/devhubApi';

vi.mock('./devhub.css', () => ({}));
vi.mock('../../services/devhubApi', () => ({
  displayApiBase: () => 'http://127.0.0.1:4000',
  devhubApi: { docs: vi.fn(), listKeys: vi.fn(), tryEndpoint: vi.fn() },
}));

const api = vi.mocked(devhubApi);

const KEY: DevApiKey = {
  _id: 'k1', name: 'price-bot', key: 'mk_' + 'a'.repeat(64),
  permissions: ['read'], used: 12, created: '2026-10-01T10:00:00.000Z',
  lastUsed: '2026-11-09T08:30:00.000Z', revoked: false,
};

const DOCS: DevDocs = {
  version: '1.0.0',
  baseUrl: 'http://127.0.0.1:4000',
  authentication: {
    developer: { header: 'x-api-key', prefix: 'mk_', description: 'A developer key grants read on /api/devhub/v1.', permission: 'read', rateLimitPerMinute: 120 },
    user: { header: 'Authorization: Bearer', description: 'The token from login. A developer key cannot manage keys.' },
  },
  endpoints: [
    { method: 'GET', path: '/api/devhub/v1/whoami', description: 'Which account this key belongs to.', auth: 'x-api-key' },
    { method: 'GET', path: '/api/devhub/v1/status', description: 'Chain height and sync state.', auth: 'x-api-key' },
    { method: 'GET', path: '/api/devhub/v1/blocks', description: 'Recent blocks.', auth: 'x-api-key' },
    { method: 'GET', path: '/api/devhub/v1/blocks/:height', description: 'One block by height.', auth: 'x-api-key' },
    { method: 'GET', path: '/api/devhub/keys', description: 'List your developer keys.', auth: 'bearer' },
    { method: 'GET', path: '/api/devhub/docs', description: 'This document.', auth: false },
  ],
  notes: ['A 502 or 503 means the chain node was unreachable, not that your key is wrong.'],
};

const rowOf = (path: string) => screen.getByText(path).closest('.dh-endpoint') as HTMLElement;
const openRow = (path: string) => { fireEvent.click(within(rowOf(path)).getByRole('button', { expanded: false })); return within(rowOf(path)); };
const response = () => document.querySelector('.dh-response') as HTMLElement;

function mount(initialKey?: string, keysVersion = 0) {
  return render(
    <>
      <Endpoints initialKey={initialKey} keysVersion={keysVersion} />
      <ToastHost />
    </>,
  );
}

async function settled() {
  await waitFor(() => expect(screen.queryByText('Reading the endpoint list from the server…')).toBeNull());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  api.docs.mockResolvedValue({ ok: true, data: DOCS });
  api.listKeys.mockResolvedValue({ ok: true, data: [KEY] });
  api.tryEndpoint.mockResolvedValue({ status: 200, ms: 34, body: { ok: true, data: { owner: 'dan' } }, rateLimit: { limit: '120', remaining: '119' } });
});

describe('the list is the server’s list', () => {
  test('every documented endpoint is listed with its method and auth', async () => {
    mount();
    await settled();
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(DOCS.endpoints.length);
    expect(screen.getByText(`${DOCS.endpoints.length} of ${DOCS.endpoints.length}`)).toBeTruthy();
    expect(within(rowOf('/api/devhub/v1/whoami')).getByText('api key')).toBeTruthy();
    expect(within(rowOf('/api/devhub/keys')).getByText('session')).toBeTruthy();
    expect(within(rowOf('/api/devhub/docs')).getByText('public')).toBeTruthy();
    expect(within(rowOf('/api/devhub/v1/status')).getByText('Chain height and sync state.')).toBeTruthy();
  });

  test('the auth cards quote the server’s own description and rate limit', async () => {
    mount();
    await settled();
    expect(screen.getByText('A developer key grants read on /api/devhub/v1.')).toBeTruthy();
    expect(screen.getByText('120 / min')).toBeTruthy();
    expect(screen.getByText('API v1.0.0')).toBeTruthy();
    expect(screen.getByText('http://127.0.0.1:4000')).toBeTruthy();
  });

  test('the behaviour notes are shown, including what a 502 means', async () => {
    mount();
    await settled();
    expect(screen.getByText(/A 502 or 503 means the chain node was unreachable/)).toBeTruthy();
  });

  test('a docs failure is reported with a Retry that works', async () => {
    api.docs.mockResolvedValueOnce({ ok: false, error: 'Developer API is offline' });
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Developer API is offline'));
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await waitFor(() => expect(document.querySelectorAll('.dh-endpoint').length).toBe(6));
  });

  test('search matches path, method and description', async () => {
    mount();
    await settled();
    const search = screen.getByLabelText('Search endpoints');
    fireEvent.change(search, { target: { value: 'whoami' } });
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(1);
    fireEvent.change(search, { target: { value: 'sync state' } });
    expect(screen.getByText('/api/devhub/v1/status')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing here' } });
    expect(screen.getByText('Nothing matches those filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(6);
  });

  test('the auth filter narrows to one kind and counts what is left', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('Filter by authentication'), { target: { value: 'bearer' } });
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(1);
    expect(screen.getByText('1 of 6')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by authentication'), { target: { value: 'public' } });
    expect(screen.getByText('/api/devhub/docs')).toBeTruthy();
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(1);
    fireEvent.change(screen.getByLabelText('Filter by authentication'), { target: { value: 'x-api-key' } });
    expect(document.querySelectorAll('.dh-endpoint').length).toBe(4);
  });
});

describe('sending a request for real', () => {
  test('a key route cannot be sent until a key is chosen, and says why', async () => {
    mount();
    await settled();
    const row = openRow('/api/devhub/v1/whoami');
    expect(row.getByText(/Choose a key in the rail above/)).toBeTruthy();
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint).not.toHaveBeenCalled();
    expect(screen.getByText('Choose one of your API keys to send with this request')).toBeTruthy();
  });

  test('choosing a key sends it, and the panel shows the real status, latency and quota', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint).toHaveBeenCalledTimes(1);
    expect(api.tryEndpoint.mock.calls[0][0]).toMatchObject({ path: '/api/devhub/v1/whoami' });
    expect(api.tryEndpoint.mock.calls[0][2]).toBe(KEY.key);
    expect(response().textContent).toContain('200');
    expect(response().textContent).toContain('34 ms');
    expect(response().textContent).toContain('119 / 120 calls left this minute');
    expect(response().querySelector('pre')?.textContent).toContain('"owner": "dan"');
    expect(response().querySelector('.dh-status')?.className).toContain('good');
  });

  test('a 401 is shown as a 401, not smoothed into an empty success', async () => {
    api.tryEndpoint.mockResolvedValue({ status: 401, ms: 8, body: { ok: false, error: 'Invalid or revoked API key' }, rateLimit: { limit: null, remaining: null } });
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(response().querySelector('.dh-status')?.textContent).toBe('401');
    expect(response().querySelector('.dh-status')?.className).toContain('bad');
    expect(response().textContent).toContain('Invalid or revoked API key');
    expect(response().textContent).not.toContain('calls left this minute');
    expect(screen.getByText(/→ 401/)).toBeTruthy();
  });

  test('an unreachable chain reads as a 502 with the server’s own words', async () => {
    api.tryEndpoint.mockResolvedValue({ status: 502, ms: 5002, body: { ok: false, error: 'chain REST/RPC is unreachable from this stub' }, rateLimit: { limit: '120', remaining: '118' } });
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/status');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(response().querySelector('.dh-status')?.textContent).toBe('502');
    expect(response().textContent).toContain('chain REST/RPC is unreachable');
    expect(response().textContent).toContain('5002 ms');
  });

  test('a network failure with no status says ERR rather than pretending to be 200', async () => {
    api.tryEndpoint.mockResolvedValue({ status: 0, ms: 12, body: { ok: false, error: 'Failed to fetch' } });
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(response().querySelector('.dh-status')?.textContent).toBe('ERR');
    expect(response().textContent).toContain('Failed to fetch');
  });

  test('a session route is sent without a developer key', async () => {
    mount();
    await settled();
    const row = openRow('/api/devhub/keys');
    expect(row.getByText('Sent with your browser session, not with a developer key.')).toBeTruthy();
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint.mock.calls[0][2]).toBe('');
  });

  test('a public route needs neither a key nor a session', async () => {
    mount();
    await settled();
    const row = openRow('/api/devhub/docs');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint).toHaveBeenCalledTimes(1);
    expect(api.tryEndpoint.mock.calls[0][2]).toBe('');
  });

  test('using a key re-reads the key list, so the call counter moves', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    api.listKeys.mockResolvedValue({ ok: true, data: [{ ...KEY, used: 13 }] });
    const row = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    await waitFor(() => expect(screen.getByText('price-bot · 13 calls')).toBeTruthy());
  });

  test('each endpoint keeps its own response across the accordion', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const first = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(first.getByRole('button', { name: 'Send request' })); });
    api.tryEndpoint.mockResolvedValue({ status: 502, ms: 90, body: { ok: false, error: 'unreachable' }, rateLimit: { limit: '120', remaining: '118' } });
    const second = openRow('/api/devhub/v1/status');
    await act(async () => { fireEvent.click(second.getByRole('button', { name: 'Send request' })); });
    expect(within(rowOf('/api/devhub/v1/status')).getByText('502')).toBeTruthy();
    expect(within(rowOf('/api/devhub/v1/status')).queryByText('200')).toBeNull();
    const reopened = openRow('/api/devhub/v1/whoami');
    expect(reopened.getByText('200')).toBeTruthy();
    expect(reopened.getByText('34 ms')).toBeTruthy();
    expect(reopened.queryByText('502')).toBeNull();
  });

  test('Copy body copies the response the server actually sent', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/whoami');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    fireEvent.click(row.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0])).toEqual({ ok: true, data: { owner: 'dan' } });
  });
});

describe('path parameters and query strings', () => {
  test('a placeholder must be filled before the request goes out', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/blocks/:height');
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint).not.toHaveBeenCalled();
    expect(screen.getByText('Fill in height first')).toBeTruthy();
    fireEvent.change(row.getByLabelText('height for /api/devhub/v1/blocks/:height'), { target: { value: '128' } });
    expect(row.getByText('http://127.0.0.1:4000/api/devhub/v1/blocks/128')).toBeTruthy();
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint.mock.calls[0][1]).toEqual({ height: '128' });
  });

  test('the block limit becomes a query string, and the preview shows it', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/blocks');
    expect(row.getByText('http://127.0.0.1:4000/api/devhub/v1/blocks?limit=20')).toBeTruthy();
    fireEvent.change(row.getByLabelText('Block limit'), { target: { value: '7' } });
    expect(row.getByText('http://127.0.0.1:4000/api/devhub/v1/blocks?limit=7')).toBeTruthy();
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint.mock.calls[0][3]).toEqual({ limit: '7' });
  });

  test('an empty limit drops the query string instead of sending limit=', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/blocks');
    fireEvent.change(row.getByLabelText('Block limit'), { target: { value: '' } });
    expect(row.getByText('http://127.0.0.1:4000/api/devhub/v1/blocks')).toBeTruthy();
    await act(async () => { fireEvent.click(row.getByRole('button', { name: 'Send request' })); });
    expect(api.tryEndpoint.mock.calls[0][3]).toEqual({ limit: '' });
  });
});

describe('cURL you can paste', () => {
  test('the copied command hides the key by default', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    const row = openRow('/api/devhub/v1/whoami');
    fireEvent.click(row.getByRole('button', { name: 'Copy as cURL' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const command = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(command).toContain('curl -X GET "http://127.0.0.1:4000/api/devhub/v1/whoami"');
    expect(command).toContain('-H "x-api-key: mk_…"');
    expect(command).not.toContain(KEY.key);
  });

  test('asking for the real key puts it in, and it is off again on a fresh mount', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('API key to send'), { target: { value: 'k1' } });
    fireEvent.click(screen.getByLabelText('Put the real key in copied cURL'));
    const row = openRow('/api/devhub/v1/blocks/:height');
    fireEvent.change(row.getByLabelText('height for /api/devhub/v1/blocks/:height'), { target: { value: '9' } });
    fireEvent.click(row.getByRole('button', { name: 'Copy as cURL' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const command = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(command).toContain(KEY.key);
    expect(command).toContain('/blocks/9');
  });

  test('a public route copies without an auth header', async () => {
    mount();
    await settled();
    const row = openRow('/api/devhub/docs');
    fireEvent.click(row.getByRole('button', { name: 'Copy as cURL' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]).not.toContain('-H');
  });
});

describe('hand-off from the key panel', () => {
  test('a key handed over is preselected once the list arrives', async () => {
    mount(KEY.key);
    await settled();
    await waitFor(() => expect((screen.getByLabelText('API key to send') as HTMLSelectElement).value).toBe('k1'));
    const row = openRow('/api/devhub/v1/whoami');
    expect(row.queryByText(/Choose a key in the rail above/)).toBeNull();
  });

  test('no keys at all is explained rather than left as an empty dropdown', async () => {
    api.listKeys.mockResolvedValue({ ok: true, data: [] });
    mount();
    await settled();
    expect(screen.getByText('No keys yet — create one in the API keys tab.')).toBeTruthy();
    expect((screen.getByLabelText('API key to send') as HTMLSelectElement).value).toBe('');
  });

  test('a key created after this panel mounted arrives when the count moves', async () => {
    // One mutable server, so both mount-time reads see the same truth.
    let serverKeys: DevApiKey[] = [];
    api.listKeys.mockImplementation(async () => ({ ok: true, data: serverKeys }));
    const view = render(
      <>
        <Endpoints keysVersion={0} />
        <ToastHost />
      </>,
    );
    await settled();
    expect(screen.getByText('No keys yet — create one in the API keys tab.')).toBeTruthy();

    serverKeys = [KEY];
    view.rerender(
      <>
        <Endpoints keysVersion={1} />
        <ToastHost />
      </>,
    );
    await waitFor(() => expect(screen.queryByText('No keys yet — create one in the API keys tab.')).toBeNull());
    expect((screen.getByLabelText('API key to send') as HTMLSelectElement).textContent).toContain('price-bot');
  });
});