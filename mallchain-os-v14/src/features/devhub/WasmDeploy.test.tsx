/**
 * The wasm bench.
 *
 * There is no compiler in this deployment, so the page must say so and must not
 * imply otherwise. What it does do is real: it walks the bytes you built, refuses
 * a module the chain would refuse, and signs MsgStoreCode / MsgInstantiateContract
 * with the app's own builders. The inspector is not mocked here — the fixture is a
 * structurally valid binary — so a drop really does produce a report.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WasmDeploy } from './WasmDeploy';
import { ToastHost } from '../../components/ui';
import { store } from '../../store/store';
import { formatBytes, MAX_WASM_BYTES, type WasmInspection } from '../../services/wasmInspect';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { storeCode, deployContract } from '../../services/wasmTx';

vi.mock('./devhub.css', () => ({}));
vi.mock('../../services/mnemonicAccess', () => ({ requestMnemonic: vi.fn() }));
vi.mock('../../services/wasmTx', () => ({ storeCode: vi.fn(), deployContract: vi.fn() }));

const unlock = vi.mocked(requestMnemonic);
const store_ = vi.mocked(storeCode);
const deploy_ = vi.mocked(deployContract);
const confirmMock = vi.fn<(message?: string) => boolean>();

const FROM = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const CONTRACT = 'mall1contractqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
const PHRASE = 'a recovery phrase that must never be printed';

function leb(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do { let b = v & 0x7f; v >>>= 7; if (v !== 0) b |= 0x80; out.push(b); } while (v !== 0);
  return out;
}
const str = (s: string) => [...leb(s.length), ...Array.from(new TextEncoder().encode(s))];
const section = (id: number, body: number[]) => [id, ...leb(body.length), ...body];

/** A valid module: env import, six functions, 17 pages of memory, the exports x/wasm wants. */
function moduleBytes(): Uint8Array {
  const names: Array<[string, number, number]> = [
    ['memory', 2, 0], ['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_8', 0, 3],
    ['instantiate', 0, 4], ['execute', 0, 5], ['query', 0, 6],
  ];
  const defined = 6;
  const exports = [...leb(names.length)];
  for (const [name, kind, index] of names) exports.push(...str(name), kind, ...leb(index));
  const code = [...leb(defined)];
  for (let i = 0; i < defined; i++) code.push(2, 0, 0x0b);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, [1, 0x60, 0, 0]),
    ...section(2, [1, ...str('env'), ...str('db_read'), 0, 0]),
    ...section(3, [...leb(defined), 0, 0, 0, 0, 0, 0]),
    ...section(5, [1, 0, ...leb(17)]),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

const BYTES = moduleBytes();
const wasmFile = (bytes: Uint8Array = BYTES, name = 'counter.wasm') => new File([bytes], name, { type: 'application/wasm' });

let onInspect = vi.fn();
let onUseInConsole = vi.fn();

function Harness({ initial = null }: { initial?: WasmInspection | null }) {
  const [wasm, setWasm] = useState<WasmInspection | null>(initial);
  return (
    <WasmDeploy
      wasm={wasm}
      onInspect={(r) => { onInspect(r); setWasm(r); }}
      onUseInConsole={onUseInConsole}
    />
  );
}

function mount(wallet = FROM, initial: WasmInspection | null = null) {
  store.state.wallet.address = wallet;
  return render(
    <>
      <Harness initial={initial} />
      <ToastHost />
    </>,
  );
}

async function drop(file = wasmFile()) {
  const input = screen.getByLabelText('Choose a compiled .wasm module');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  await waitFor(() => expect(document.querySelector('.dh-report')).toBeTruthy());
}

const report = (): WasmInspection => onInspect.mock.calls[onInspect.mock.calls.length - 1][0] as WasmInspection;
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const initField = () => screen.getByLabelText('Instantiate message (JSON)') as HTMLTextAreaElement;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  onInspect = vi.fn();
  onUseInConsole = vi.fn();
  Object.defineProperty(window, 'confirm', { value: confirmMock, configurable: true, writable: true });
  confirmMock.mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  unlock.mockResolvedValue(PHRASE);
  store_.mockResolvedValue({ codeId: '17', txHash: 'STORETX' });
  deploy_.mockResolvedValue({ codeId: '18', storeTxHash: 'STORETX2', address: CONTRACT, instantiateTxHash: 'INITTX' });
});

describe('what the page admits', () => {
  test('it says plainly that it does not compile, and explains what is real instead', () => {
    mount();
    expect(screen.getByText('This page does not compile.')).toBeTruthy();
    expect(screen.getByText(/No Rust toolchain runs here/)).toBeTruthy();
    expect(screen.getByText('MsgStoreCode')).toBeTruthy();
    expect(screen.getByText('MsgInstantiateContract')).toBeTruthy();
    expect(screen.getByText(/Both are signed offline on this device/)).toBeTruthy();
  });

  test('the build steps are commands you can actually run, each copyable', () => {
    mount();
    expect(screen.getByText('rustup target add wasm32-unknown-unknown')).toBeTruthy();
    expect(screen.getByText(/cargo build --release --target wasm32-unknown-unknown/)).toBeTruthy();
    expect(screen.getByText(/wasm-opt -Oz/)).toBeTruthy();
    expect(screen.getByText('sha256sum contract.wasm')).toBeTruthy();
    const steps = document.querySelectorAll('.dh-build-step');
    expect(steps.length).toBe(4);
    fireEvent.click(steps[0].querySelector('button') as HTMLButtonElement);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('rustup target add wasm32-unknown-unknown');
  });

  test('it never points at the unpublished SDK packages', () => {
    mount();
    expect(document.body.textContent).not.toContain('@mallchain/sdk');
    expect(document.body.textContent).not.toContain('pip install mallchain');
  });

  test('the drop zone states the limit and that the bytes stay in the tab', () => {
    mount();
    expect(screen.getByText('Drop a compiled .wasm here')).toBeTruthy();
    expect(document.querySelector('.dh-drop-m')?.textContent).toContain(`max ${formatBytes(MAX_WASM_BYTES)}`);
    expect(screen.getByText(/The bytes stay in this tab until you sign an upload/)).toBeTruthy();
  });

  test('the required exports are named, so a bad build is diagnosable', () => {
    mount();
    expect(screen.getByText(/must export/)).toBeTruthy();
    for (const name of ['allocate', 'deallocate', 'interface_version_8']) {
      expect(document.body.textContent).toContain(name);
    }
  });
});

describe('inspecting a module', () => {
  test('choosing a valid file reports the bytes, not a canned summary', async () => {
    mount();
    await drop();
    const r = report();
    expect(r.ok).toBe(true);
    expect(r.fileName).toBe('counter.wasm');
    expect(r.bytes).toBe(BYTES.length);
    expect(r.functionCount).toBe(6);
    expect(r.memoryPages).toBe(17);
    expect(r.importModules).toEqual(['env']);
    expect(screen.getByText('deployable')).toBeTruthy();
    expect(screen.getByText(formatBytes(BYTES.length))).toBeTruthy();
    expect(screen.getByText('17 pages')).toBeTruthy();
    expect(screen.getByText(/counter\.wasm inspected/)).toBeTruthy();
  });

  test('the export table is listed and the entry points are marked', async () => {
    mount();
    await drop();
    const marked = Array.from(document.querySelectorAll('.dh-export.entry')).map((n) => n.textContent);
    expect(marked).toEqual(expect.arrayContaining(['allocate', 'deallocate', 'interface_version_8', 'instantiate', 'execute', 'query']));
    expect(document.querySelectorAll('.dh-export').length).toBe(7);
    expect(document.querySelectorAll('.dh-section-chip').length).toBe(6);
  });

  test('a dropped file takes the same path as a chosen one', async () => {
    mount();
    const zone = screen.getByText('Drop a compiled .wasm here').closest('.dh-drop') as HTMLElement;
    await act(async () => { fireEvent.drop(zone, { dataTransfer: { files: [wasmFile(BYTES, 'dropped.wasm')] } }); });
    await waitFor(() => expect(report().fileName).toBe('dropped.wasm'));
    expect(report().ok).toBe(true);
  });

  test('dragging over highlights the zone and leaving clears it', () => {
    mount();
    const zone = screen.getByText('Drop a compiled .wasm here').closest('.dh-drop') as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('over');
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('over');
  });

  test('Rust source is refused with the instruction to build it first', async () => {
    mount();
    await drop(wasmFile(new TextEncoder().encode('fn main() {}'), 'lib.rs'));
    expect(report().ok).toBe(false);
    expect(screen.getByText('rejected')).toBeTruthy();
    expect(document.querySelector('.dh-issues')?.textContent).toMatch(/cargo wasm|cargo build/);
    expect(button('Store code only').disabled).toBe(true);
    expect(button('Store & instantiate').disabled).toBe(true);
    expect(screen.getByText(/the chain would reject it and you would still pay gas/)).toBeTruthy();
  });

  test('a module missing its entry points is rejected and told which ones', async () => {
    mount();
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...section(1, [1, 0x60, 0, 0])]);
    await drop(wasmFile(bytes, 'empty.wasm'));
    expect(report().ok).toBe(false);
    expect(document.querySelector('.dh-issues')?.textContent).toContain('allocate');
    expect(button('Store & instantiate').disabled).toBe(true);
  });

  test('the checksum is shown, or its absence is explained — never faked', async () => {
    mount();
    await drop();
    const r = report();
    if (r.sha256) {
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(screen.getByText(r.sha256)).toBeTruthy();
      fireEvent.click(within(document.querySelector('.dh-key-secret') as HTMLElement).getByRole('button', { name: 'Copy' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(r.sha256);
    } else {
      expect(screen.getByText(/this origin has no WebCrypto/)).toBeTruthy();
      expect(screen.getByText('sha256sum')).toBeTruthy();
    }
  });

  test('Remove clears the report and returns the drop zone', async () => {
    mount();
    await drop();
    fireEvent.click(button('Remove'));
    expect(onInspect).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Drop a compiled .wasm here')).toBeTruthy();
    expect(document.querySelector('.dh-report')).toBeNull();
  });

  test('a second file replaces the first rather than stacking reports', async () => {
    mount();
    await drop();
    await drop(wasmFile(BYTES, 'second.wasm'));
    expect(document.querySelectorAll('.dh-report').length).toBe(1);
    expect(screen.getByText('second.wasm')).toBeTruthy();
    expect(screen.queryByText('counter.wasm')).toBeNull();
  });
});

describe('the instantiate message', () => {
  test('broken JSON is named as broken and blocks instantiation', async () => {
    mount();
    await drop();
    fireEvent.change(initField(), { target: { value: '{"count":' } });
    expect(screen.getByText(/^Invalid JSON:/)).toBeTruthy();
    expect(initField().className).toContain('bad');
    expect(button('Store & instantiate').disabled).toBe(true);
    expect(button('Store code only').disabled).toBe(false);
  });

  test('a JSON array is not an instantiate message', async () => {
    mount();
    await drop();
    fireEvent.change(initField(), { target: { value: '[1,2,3]' } });
    expect(screen.getByText('The instantiate message must be a JSON object.')).toBeTruthy();
    expect(button('Store & instantiate').disabled).toBe(true);
  });

  test('the mgp20 preset matches the contract in the repo', async () => {
    mount();
    fireEvent.click(button('mgp20 token shape'));
    expect(JSON.parse(initField().value)).toEqual({ name: 'Example Token', symbol: 'EXT', decimals: 6 });
    expect(screen.getByText(/wasm\/contracts\/mgp20\/src\/lib\.rs/)).toBeTruthy();
  });

  test('Empty object and Format both do what they say', async () => {
    mount();
    fireEvent.click(button('mgp20 token shape'));
    fireEvent.click(button('Format'));
    expect(initField().value).toContain('\n  "name": "Example Token"');
    fireEvent.click(button('Empty object'));
    expect(initField().value).toBe('{}');
  });

  test('Format on broken JSON says to fix it instead of throwing', async () => {
    mount();
    fireEvent.change(initField(), { target: { value: '{oops' } });
    fireEvent.click(button('Format'));
    expect(screen.getByText('Fix the JSON first')).toBeTruthy();
    expect(initField().value).toBe('{oops');
  });

  test('the label is editable and capped at the chain’s 128 characters', () => {
    mount();
    const label = screen.getByLabelText('Instance label') as HTMLInputElement;
    expect(label.value).toBe('my-contract');
    expect(label.maxLength).toBe(128);
    fireEvent.change(label, { target: { value: 'counter-eu' } });
    expect(label.value).toBe('counter-eu');
  });
});

describe('uploading for real', () => {
  test('with no module both upload buttons are disabled', () => {
    mount();
    expect(button('Store code only').disabled).toBe(true);
    expect(button('Store & instantiate').disabled).toBe(true);
  });

  test('with no wallet the buttons stay disabled and the reason is shown', async () => {
    mount('');
    await drop();
    expect(button('Store code only').disabled).toBe(true);
    expect(screen.getByText('Connect a wallet to enable uploading.')).toBeTruthy();
    expect(unlock).not.toHaveBeenCalled();
  });

  test('Store code only confirms the size and the signer, then signs one transaction', async () => {
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store code only')); });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = String(confirmMock.mock.calls[0][0]);
    expect(asked).toContain('counter.wasm');
    expect(asked).toContain(formatBytes(BYTES.length));
    expect(asked).toContain('MsgStoreCode');
    expect(asked).toContain(FROM);
    expect(asked).toContain('cannot be undone');
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(store_).toHaveBeenCalledTimes(1);
    expect(store_.mock.calls[0][0]).toMatchObject({ mnemonic: PHRASE, sender: FROM });
    expect(store_.mock.calls[0][0].wasmByteCode).toEqual(BYTES);
    expect(deploy_).not.toHaveBeenCalled();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText('STORETX')).toBeTruthy();
    expect(screen.getByText('Stored as code 17')).toBeTruthy();
  });

  test('Store & instantiate sends the trimmed label and the parsed message, and reports both transactions', async () => {
    mount();
    await drop();
    fireEvent.change(screen.getByLabelText('Instance label'), { target: { value: '  counter-eu  ' } });
    fireEvent.change(initField(), { target: { value: '{"count":7}' } });
    await act(async () => { fireEvent.click(button('Store & instantiate')); });
    expect(String(confirmMock.mock.calls[0][0])).toContain('Two transactions');
    expect(deploy_).toHaveBeenCalledTimes(1);
    expect(deploy_.mock.calls[0][0]).toMatchObject({ sender: FROM, label: 'counter-eu', initMsg: { count: 7 } });
    expect(store_).not.toHaveBeenCalled();
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('STORETX2')).toBeTruthy();
    expect(screen.getByText(CONTRACT)).toBeTruthy();
    expect(screen.getByText('INITTX')).toBeTruthy();
  });

  test('declining the confirmation uploads nothing', async () => {
    confirmMock.mockReturnValue(false);
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store code only')); });
    expect(unlock).not.toHaveBeenCalled();
    expect(store_).not.toHaveBeenCalled();
    expect(document.querySelector('.dh-result')).toBeNull();
  });

  test('a dismissed cipher wall uploads nothing and says so', async () => {
    unlock.mockResolvedValue(null);
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store code only')); });
    expect(store_).not.toHaveBeenCalled();
    expect(screen.getByText('The cipher wall was dismissed, so nothing was uploaded.')).toBeTruthy();
  });

  test('a broadcast failure is surfaced verbatim, with no result rows', async () => {
    store_.mockRejectedValue(new Error('no chain node is reachable from this stub'));
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store code only')); });
    expect(screen.getByRole('alert').textContent).toContain('no chain node is reachable from this stub');
    expect(document.querySelector('.dh-result')).toBeNull();
    expect(button('Store code only').disabled).toBe(false);
  });

  test('an empty label blocks instantiation before anything is signed', async () => {
    mount();
    await drop();
    fireEvent.change(screen.getByLabelText('Instance label'), { target: { value: '   ' } });
    await act(async () => { fireEvent.click(button('Store & instantiate')); });
    expect(screen.getByRole('alert').textContent).toContain('Give the instance a label');
    expect(unlock).not.toHaveBeenCalled();
    expect(deploy_).not.toHaveBeenCalled();
  });

  test('the recovery phrase is never rendered', async () => {
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store code only')); });
    expect(document.body.textContent).not.toContain(PHRASE);
  });

  test('Copy code ID and Copy address copy the values the chain returned', async () => {
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store & instantiate')); });
    fireEvent.click(button('Copy code ID'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('18');
    fireEvent.click(button('Copy address'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CONTRACT);
  });
});

describe('handing work to the console', () => {
  test('a ready module offers the three upload sentences', async () => {
    mount();
    await drop();
    fireEvent.click(button('store wasm'));
    expect(onUseInConsole).toHaveBeenLastCalledWith('store wasm');
    fireEvent.click(button('deploy label …'));
    expect(onUseInConsole).toHaveBeenLastCalledWith('deploy label "my-contract" init {}');
    fireEvent.click(button('instantiate an existing code ID'));
    expect(onUseInConsole).toHaveBeenLastCalledWith('instantiate 1 label "my-contract" init {}');
  });

  test('the hand-off carries the label and message you actually typed', async () => {
    mount();
    await drop();
    fireEvent.change(screen.getByLabelText('Instance label'), { target: { value: 'counter-eu' } });
    fireEvent.change(initField(), { target: { value: '{"count":3}' } });
    fireEvent.click(button('deploy label …'));
    expect(onUseInConsole).toHaveBeenLastCalledWith('deploy label "counter-eu" init {"count":3}');
  });

  test('after a deploy the console is offered a call against the real address', async () => {
    mount();
    await drop();
    await act(async () => { fireEvent.click(button('Store & instantiate')); });
    fireEvent.click(button('Call it in the console'));
    expect(onUseInConsole).toHaveBeenCalledWith(`execute ${CONTRACT} {"transfer":{"to":"mall1…","amount":"100"}}`);
    expect(screen.queryByText('Or drive it from a sentence')).toBeNull();
  });

  test('a rejected module offers no upload sentences at all', async () => {
    mount();
    await drop(wasmFile(new TextEncoder().encode('not wasm'), 'notes.txt'));
    expect(screen.queryByText('Or drive it from a sentence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'store wasm' })).toBeNull();
  });
});