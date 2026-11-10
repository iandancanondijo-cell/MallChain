/**
 * The Developer Hub shell.
 *
 * The point of keeping every panel mounted is that switching tabs must not cost
 * you work: a session log, an inspected module and a half-filled request all have
 * to survive. These also pin that the environment strip reads the app's real
 * chain config rather than a hardcoded banner, and that the deploy bench and the
 * console hand commands to each other.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DevHub from './DevHub';
import { ToastHost } from '../../components/ui';
import { store } from '../../store/store';
import { chain, config } from '../../services/config';
import { devhubApi } from '../../services/devhubApi';
import { runCommand } from '../../services/commandRunner';
import { requestMnemonic } from '../../services/mnemonicAccess';

vi.mock('./devhub.css', () => ({}));
vi.mock('../../services/commandRunner', () => ({ runCommand: vi.fn() }));
vi.mock('../../services/mnemonicAccess', () => ({ requestMnemonic: vi.fn() }));
vi.mock('../../services/wasmTx', () => ({ storeCode: vi.fn(), deployContract: vi.fn() }));
vi.mock('../../services/devhubApi', () => ({
  displayApiBase: () => 'http://127.0.0.1:4000',
  devhubApi: {
    docs: vi.fn(), listKeys: vi.fn(), usage: vi.fn(), createKey: vi.fn(),
    renameKey: vi.fn(), revokeKey: vi.fn(), testKey: vi.fn(), tryEndpoint: vi.fn(),
  },
}));

const api = vi.mocked(devhubApi);
const run = vi.mocked(runCommand);
const FROM = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';

const DOCS = {
  version: '1.0.0',
  baseUrl: 'http://127.0.0.1:4000',
  authentication: {
    developer: { header: 'x-api-key', prefix: 'mk_', description: 'Read on the developer API.', permission: 'read', rateLimitPerMinute: 120 },
    user: { header: 'Authorization: Bearer', description: 'Your login session.' },
  },
  endpoints: [{ method: 'GET', path: '/api/devhub/v1/whoami', description: 'Which account this key belongs to.', auth: 'x-api-key' as const }],
  notes: [],
};

function leb(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do { let b = v & 0x7f; v >>>= 7; if (v !== 0) b |= 0x80; out.push(b); } while (v !== 0);
  return out;
}
const str = (s: string) => [...leb(s.length), ...Array.from(new TextEncoder().encode(s))];
const section = (id: number, body: number[]) => [id, ...leb(body.length), ...body];

function moduleFile() {
  const names: Array<[string, number, number]> = [
    ['memory', 2, 0], ['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_8', 0, 3],
    ['instantiate', 0, 4], ['execute', 0, 5], ['query', 0, 6],
  ];
  const exports = [...leb(names.length)];
  for (const [name, kind, index] of names) exports.push(...str(name), kind, ...leb(index));
  const code = [...leb(6)];
  for (let i = 0; i < 6; i++) code.push(2, 0, 0x0b);
  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, [1, 0x60, 0, 0]),
    ...section(2, [1, ...str('env'), ...str('db_read'), 0, 0]),
    ...section(3, [6, 0, 0, 0, 0, 0, 0]),
    ...section(5, [1, 0, 17]),
    ...section(7, exports),
    ...section(10, code),
  ]);
  return new File([bytes], 'counter.wasm', { type: 'application/wasm' });
}

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const panel = (id: string) => document.getElementById(`dh-panel-${id}`) as HTMLElement;
const visible = (id: string) => panel(id).style.display !== 'none';
const go = (name: string) => fireEvent.click(tab(name));

function mount(wallet = FROM, holdsKeys = true) {
  store.state.wallet.address = wallet;
  store.state.wallet.pinEncryptedMnemonic = holdsKeys ? 'cipher-blob' : '';
  return render(
    <>
      <DevHub />
      <ToastHost />
    </>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  // Run a node fetches its bundle listing on mount; keep that off the network.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  run.mockResolvedValue({ ok: true, data: { MALL: '12.5' } });
  vi.mocked(requestMnemonic).mockResolvedValue('a phrase');
  api.docs.mockResolvedValue({ ok: true, data: DOCS });
  api.listKeys.mockResolvedValue({ ok: true, data: [] });
  api.usage.mockResolvedValue({ ok: true, data: { totalRequests: 0, keysActive: 0, keysTotal: 0, usage: [], lastUpdated: '' } });
});

describe('the environment strip is the app’s real config', () => {
  test('chain id, prefix, gas price and API base come from config, not a banner', () => {
    mount();
    const strip = document.querySelector('.dh-env') as HTMLElement;
    expect(strip.textContent).toContain(chain.chainId);
    expect(strip.textContent).toContain(`${chain.addressPrefix}1…`);
    expect(strip.textContent).toContain(chain.gasPrice);
    expect(strip.textContent).toContain('http://127.0.0.1:4000');
    expect(strip.textContent).toContain(FROM);
  });

  test('no wallet reads as not connected rather than showing a stale address', () => {
    mount('');
    expect((document.querySelector('.dh-env') as HTMLElement).textContent).toContain('not connected');
  });

  test('an address this device cannot sign for is not called a signing wallet', () => {
    const strip = () => (document.querySelector('.dh-env') as HTMLElement).textContent || '';
    mount();
    expect(strip()).toContain('Signing wallet');
    cleanup();
    mount(FROM, false);
    expect(strip()).toContain('Wallet address');
    expect(strip()).not.toContain('Signing wallet');
    expect(strip()).toContain(FROM);
  });
});

describe('tabs', () => {
  test('the console is the first thing you see, and only one panel is visible', () => {
    mount();
    expect(tab('Console').getAttribute('aria-selected')).toBe('true');
    expect(visible('console')).toBe(true);
    for (const id of ['deploy', 'keys', 'endpoints', 'node']) expect(visible(id)).toBe(false);
  });

  test('every tab is wired to the panel it names', () => {
    mount();
    for (const [label, id] of [['Console', 'console'], ['Deploy', 'deploy'], ['API keys', 'keys'], ['Endpoints', 'endpoints'], ['Run a node', 'node']]) {
      go(label);
      expect(tab(label).getAttribute('aria-selected')).toBe('true');
      expect(tab(label).getAttribute('aria-controls')).toBe(`dh-panel-${id}`);
      expect(visible(id)).toBe(true);
      expect(document.querySelectorAll('[role="tabpanel"]').length).toBe(5);
      expect(Array.from(document.querySelectorAll('[role="tabpanel"]')).filter((p) => (p as HTMLElement).style.display !== 'none').length).toBe(1);
    }
  });

  test('a session log survives a round trip through every other tab', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Natural-language chain command'), { target: { value: `balance of ${FROM}` } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Parse & run/ })); });
    expect(screen.getByRole('log').textContent).toContain('Done.');
    for (const label of ['Deploy', 'API keys', 'Endpoints', 'Run a node', 'Console']) go(label);
    expect(screen.getByRole('log').textContent).toContain('Done.');
    expect((screen.getByLabelText('Natural-language chain command') as HTMLTextAreaElement).value).toBe(`balance of ${FROM}`);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('a half-filled endpoint request survives leaving and returning', async () => {
    mount();
    go('Endpoints');
    await waitFor(() => expect(screen.getByText('/api/devhub/v1/whoami')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Search endpoints'), { target: { value: 'whoami' } });
    fireEvent.click(within(panel('endpoints')).getByRole('button', { expanded: false }));
    go('Console');
    go('Endpoints');
    expect((screen.getByLabelText('Search endpoints') as HTMLInputElement).value).toBe('whoami');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
  });
});

describe('the module travels from the bench to the console', () => {
  test('inspecting a module badges the Deploy tab and unblocks an upload command', async () => {
    mount();
    go('Deploy');
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a compiled .wasm module'), { target: { files: [moduleFile()] } }); });
    await waitFor(() => expect(screen.getByText('deployable')).toBeTruthy());
    expect(tab('Deploy').textContent).toContain('ready');
    go('Console');
    fireEvent.change(screen.getByLabelText('Natural-language chain command'), { target: { value: 'store wasm' } });
    expect((screen.getByRole('button', { name: /Parse & run/ }) as HTMLButtonElement).disabled).toBe(false);
    const consolePanel = within(panel('console'));
    expect(consolePanel.getByText(/counter\.wasm/)).toBeTruthy();
    expect(consolePanel.getByText('valid')).toBeTruthy();
  });

  test('a rejected module badges the tab as bad, never as ready', async () => {
    mount();
    go('Deploy');
    const bad = new File([new TextEncoder().encode('fn main() {}')], 'lib.rs', { type: 'text/plain' });
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a compiled .wasm module'), { target: { files: [bad] } }); });
    await waitFor(() => expect(within(panel('deploy')).getByText('rejected')).toBeTruthy());
    expect(tab('Deploy').textContent).toContain('bad');
    expect(tab('Deploy').textContent).not.toContain('ready');
  });

  test('the console can send you to the bench when a module is missing', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Natural-language chain command'), { target: { value: 'store wasm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open the Deploy tab' }));
    expect(visible('deploy')).toBe(true);
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true');
  });

  test('a sentence handed over from the bench lands in the console composer', async () => {
    mount();
    go('Deploy');
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a compiled .wasm module'), { target: { files: [moduleFile()] } }); });
    await waitFor(() => expect(screen.getByText('deployable')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Instance label'), { target: { value: 'counter-eu' } });
    fireEvent.click(screen.getByRole('button', { name: 'deploy label …' }));
    expect(visible('console')).toBe(true);
    expect((screen.getByLabelText('Natural-language chain command') as HTMLTextAreaElement).value).toBe('deploy label "counter-eu" init {}');
  });

  test('the bench Change button returns to a module that is still attached', async () => {
    mount();
    go('Deploy');
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a compiled .wasm module'), { target: { files: [moduleFile()] } }); });
    await waitFor(() => expect(screen.getByText('deployable')).toBeTruthy());
    go('Console');
    fireEvent.click(within(panel('console')).getByRole('button', { name: 'Change' }));
    expect(visible('deploy')).toBe(true);
    expect(screen.getByText('deployable')).toBeTruthy();
  });
});

describe('a key travels from the key panel to the explorer', () => {
  test('the tab badge shows the real key count and Try an endpoint preselects it', async () => {
    const key = {
      _id: 'k1', name: 'price-bot', key: 'mk_' + 'a'.repeat(64), permissions: ['read'],
      used: 4, created: '2026-10-01T10:00:00.000Z', lastUsed: null, revoked: false,
    };
    api.listKeys.mockResolvedValue({ ok: true, data: [key] });
    mount();
    go('API keys');
    await waitFor(() => expect(screen.getByText('price-bot')).toBeTruthy());
    expect(tab('API keys').textContent).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: 'Try an endpoint' }));
    expect(visible('endpoints')).toBe(true);
    await waitFor(() => expect((screen.getByLabelText('API key to send') as HTMLSelectElement).value).toBe('k1'));
  });

  test('no keys means no badge, not a zero', async () => {
    mount();
    go('API keys');
    await waitFor(() => expect(screen.getByText('No API keys yet')).toBeTruthy());
    expect(tab('API keys').querySelector('.dh-tab-count')).toBeNull();
  });
});