/**
 * The natural-language console.
 *
 * These pin the promises the page makes to a developer: that what is previewed
 * is exactly what runs, that an unmappable sentence is refused rather than
 * guessed at, that funds need a confirmation and a cipher wall, that a cancelled
 * prompt sends nothing, and that a failed broadcast prints the chain's own error
 * instead of a success. The parser is real; only the runner and the mnemonic
 * prompt are stubbed so a click cannot reach the network.
 */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandConsole } from './CommandConsole';
import { ToastHost } from '../../components/ui';
import { store } from '../../store/store';
import { runCommand } from '../../services/commandRunner';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { COMMAND_EXAMPLES } from '../../services/commandParser';
import type { WasmInspection } from '../../services/wasmInspect';

vi.mock('./devhub.css', () => ({}));
vi.mock('../../services/commandRunner', () => ({ runCommand: vi.fn() }));
vi.mock('../../services/mnemonicAccess', () => ({ requestMnemonic: vi.fn() }));

const run = vi.mocked(runCommand);
const unlock = vi.mocked(requestMnemonic);
// happy-dom ships no native dialogs, so the confirmation gate needs a stand-in.
const confirmMock = vi.fn<(message?: string) => boolean>();

const ADDR = 'mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336';
const FROM = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const PHRASE = 'a recovery phrase that must never be printed';

const WASM: WasmInspection = {
  ok: true, fileName: 'counter.wasm', bytes: 4096, sha256: 'a'.repeat(64), version: 1,
  sections: [], exports: [], importModules: ['env'], functionCount: 6, memoryPages: 17,
  issues: [], data: new Uint8Array([0, 97, 115, 109]),
};

const composer = () => screen.getByLabelText('Natural-language chain command') as HTMLTextAreaElement;
const log = () => screen.getByRole('log').textContent || '';
// The toast host is also a status region, so the parse verdict is read by class.
const problem = () => document.querySelector('.dh-parse-error')?.textContent || '';
const runButton = () => screen.getByRole('button', { name: /Parse & run|Running/ }) as HTMLButtonElement;

function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

async function clickRun() {
  await act(async () => { fireEvent.click(runButton()); });
}

function mount(props: Partial<Parameters<typeof CommandConsole>[0]> = {}, wallet = FROM, holdsKeys = true) {
  store.state.wallet.address = wallet;
  store.state.wallet.pinEncryptedMnemonic = holdsKeys ? 'cipher-blob' : '';
  return render(
    <>
      <CommandConsole wasm={null} onOpenDeploy={() => {}} {...props} />
      <ToastHost />
    </>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  run.mockResolvedValue({ ok: true, data: { txHash: 'TXHASH123', height: 42 } });
  unlock.mockResolvedValue(PHRASE);
  Object.defineProperty(window, 'confirm', { value: confirmMock, configurable: true, writable: true });
  confirmMock.mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

describe('what the page claims', () => {
  test('the empty log says nothing is simulated and a success carries a real hash', () => {
    mount();
    expect(log()).toContain('Nothing here is simulated');
    expect(log()).toContain('real transaction hash');
    expect(log()).toContain("chain's own error");
  });

  test('every shipped example is offered and fills the composer when clicked', () => {
    mount();
    for (const ex of COMMAND_EXAMPLES) {
      expect(screen.getByText(ex.text)).toBeTruthy();
    }
    fireEvent.click(screen.getByText(COMMAND_EXAMPLES[1].text));
    expect(composer().value).toBe(COMMAND_EXAMPLES[1].text);
  });

  test('the example filter really narrows the list', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Filter examples'), { target: { value: 'read' } });
    expect(screen.getByText(COMMAND_EXAMPLES[0].text)).toBeTruthy();
    expect(screen.queryByText(COMMAND_EXAMPLES[1].text)).toBeNull();
  });

  test('the rail calls the address a signing wallet only when this device holds keys', () => {
    // The examples block reuses dh-rail-row, so the wallet row is the one that
    // names the address.
    const row = () => [...document.querySelectorAll('.dh-rail-row')]
      .find((r) => r.textContent?.includes(FROM))?.textContent || '';
    mount();
    expect(row()).toContain('Signing as');
    expect(row()).not.toContain('no keys here');
    cleanup();
    mount({}, FROM, false);
    expect(row()).toContain('Address on screen');
    expect(row()).toContain('no keys here');
    expect(row()).toContain(FROM);
  });
});

describe('the preview is the contract', () => {
  test('a valid sentence shows the risk, the exact builder, the summary and every parameter', () => {
    mount();
    type(`send 25 MALL to ${ADDR} memo invoice 42`);
    expect(screen.getByText('funds')).toBeTruthy();
    expect(screen.getByText('send')).toBeTruthy();
    expect(screen.getByText('mallcoinTx.sendMallcoinTransfer')).toBeTruthy();
    expect(screen.getByText(/Send 25 MALL from/)).toBeTruthy();
    expect(screen.getByText('toAddress')).toBeTruthy();
    expect(screen.getByText(ADDR)).toBeTruthy();
    expect(screen.getByText('amountMlcns')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('invoice 42')).toBeTruthy();
    expect(screen.getByText('offline on this device, after the cipher wall')).toBeTruthy();
    expect(runButton().disabled).toBe(false);
  });

  test('a read says plainly that nothing is signed', () => {
    mount();
    type(`balance of ${ADDR}`);
    expect(screen.getByText('read')).toBeTruthy();
    expect(screen.getByText('none — read only')).toBeTruthy();
  });

  test('an unmappable sentence is refused with a corrected form, and cannot be run', () => {
    mount();
    type('make me rich');
    expect(problem()).toContain('could not map');
    expect(problem()).toContain('balance, send, stake');
    expect(runButton().disabled).toBe(true);
  });

  test('a malformed transfer shows the specific reason, not a generic failure', () => {
    mount();
    type(`send 5 MALL to ${ADDR} and stake it`);
    expect(problem()).toContain('after the address');
    expect(runButton().disabled).toBe(true);
  });

  test('turning the preview off stops parsing as you type', () => {
    mount();
    type(`stake 100 MALL`);
    expect(screen.getByText('stakingTx.stakeMlcns')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Preview as I type'));
    expect(screen.queryByText('stakingTx.stakeMlcns')).toBeNull();
    expect(runButton().disabled).toBe(true);
  });

  test('an upload command with no module is blocked and offers the Deploy tab', () => {
    const onOpenDeploy = vi.fn();
    mount({ onOpenDeploy });
    type('store wasm');
    expect(screen.getByText('This command uploads a module, and none is attached.')).toBeTruthy();
    expect(runButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open the Deploy tab' }));
    expect(onOpenDeploy).toHaveBeenCalledTimes(1);
  });

  test('an attached module unblocks the upload and is named in the rail', () => {
    mount({ wasm: WASM });
    type('store wasm');
    expect(runButton().disabled).toBe(false);
    expect(screen.getByText(/counter\.wasm/)).toBeTruthy();
    expect(screen.getByText('valid')).toBeTruthy();
  });

  test('a rejected module is labelled rejected, never ready', () => {
    mount({ wasm: { ...WASM, ok: false } });
    expect(screen.getByText('rejected')).toBeTruthy();
  });
});

describe('running a command', () => {
  test('a balance read runs without a confirmation and without the cipher wall', async () => {
    run.mockResolvedValue({ ok: true, data: { MALL: '12.5', MLPTS: 300 } });
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toMatchObject({ fromAddress: FROM, mnemonic: null, wasm: null });
    expect(log()).toContain('Done.');
    expect(log()).toContain('12.5');
  });

  test('a funds command is confirmed with the exact summary before anything is signed', async () => {
    mount();
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0][0])).toContain(`Send 25 MALL from ${FROM} to ${ADDR}`);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1].mnemonic).toBe(PHRASE);
  });

  test('declining the confirmation signs nothing and says so', async () => {
    confirmMock.mockReturnValue(false);
    mount();
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(log()).toContain('Cancelled at the confirmation step. Nothing was signed.');
    expect(unlock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  test('the confirmation can be turned off, and then it is not asked', async () => {
    mount();
    fireEvent.click(screen.getByLabelText('Confirm before moving funds'));
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('a dismissed cipher wall sends nothing', async () => {
    unlock.mockResolvedValue(null);
    mount();
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(log()).toContain('The cipher wall was dismissed. Nothing was signed.');
    expect(run).not.toHaveBeenCalled();
  });

  test('no connected wallet blocks a signing command before the prompt', async () => {
    mount({}, '');
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(log()).toContain('No wallet is connected on this device');
    expect(unlock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('no wallet connected')).toBeTruthy();
  });

  test('the attached bytes are handed to the runner, not re-read from disk', async () => {
    mount({ wasm: WASM });
    type('store wasm');
    await clickRun();
    expect(run.mock.calls[0][1].wasm).toBe(WASM.data);
    expect(run.mock.calls[0][1].wasmName).toBe('counter.wasm');
  });

  test('a real broadcast failure is printed verbatim and never narrated as success', async () => {
    run.mockResolvedValue({ ok: false, error: 'no chain node is reachable from this stub' });
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    expect(log()).toContain('no chain node is reachable from this stub');
    expect(log()).not.toContain('Done.');
  });

  test('a thrown builder error is surfaced, not swallowed', async () => {
    run.mockRejectedValue(new Error('relay refused the transaction'));
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    expect(log()).toContain('relay refused the transaction');
  });

  test('the recovery phrase never reaches the session log', async () => {
    mount();
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(log()).not.toContain(PHRASE);
  });

  test('the runner log callback is wired through, so real steps appear', async () => {
    run.mockImplementation(async (_cmd, ctx) => {
      ctx.log('info', 'Building MsgTransferMallcoin');
      ctx.log('ok', 'Broadcast ABC123');
      return { ok: true, data: { txHash: 'ABC123' } };
    });
    mount();
    type(`send 25 MALL to ${ADDR}`);
    await clickRun();
    expect(log()).toContain('Building MsgTransferMallcoin');
    expect(log()).toContain('Broadcast ABC123');
    expect(log()).toContain('ABC123');
  });

  test('Ctrl+Enter runs the command', async () => {
    mount();
    type(`balance of ${ADDR}`);
    await act(async () => { fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true }); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('a second click while running does not double-send', async () => {
    let release: (v: { ok: true; data: Record<string, string> }) => void = () => {};
    run.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    mount();
    type(`balance of ${ADDR}`);
    await act(async () => { fireEvent.click(runButton()); });
    expect(runButton().textContent).toContain('Running');
    await act(async () => { fireEvent.click(runButton()); });
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, data: { txHash: 'T' } }); });
  });
});

describe('the session log', () => {
  test('history recalls the last commands with the arrow keys', async () => {
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    type('stake 100 MALL');
    await act(async () => { fireEvent.click(runButton()); });
    fireEvent.change(composer(), { target: { value: '' } });
    fireEvent.keyDown(composer(), { key: 'ArrowUp' });
    expect(composer().value).toBe('stake 100 MALL');
    fireEvent.keyDown(composer(), { key: 'ArrowUp' });
    expect(composer().value).toBe(`balance of ${ADDR}`);
    fireEvent.keyDown(composer(), { key: 'ArrowDown' });
    expect(composer().value).toBe('stake 100 MALL');
    fireEvent.keyDown(composer(), { key: 'ArrowDown' });
    expect(composer().value).toBe('');
  });

  test('the verbosity filter hides steps and explains an empty view', async () => {
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    expect(log()).toContain('Done.');
    fireEvent.change(screen.getByLabelText('Log verbosity'), { target: { value: 'important' } });
    expect(log()).toContain('Done.');
    expect(log()).not.toContain('Nothing is signed and nothing changes.');
    fireEvent.change(screen.getByLabelText('Log verbosity'), { target: { value: 'errors' } });
    expect(log()).toContain('No lines match this verbosity');
    expect(log()).not.toContain('Done.');
    fireEvent.change(screen.getByLabelText('Log verbosity'), { target: { value: 'all' } });
    expect(log()).toContain('Done.');
  });

  test('errors only keeps a real failure and drops the successful steps around it', async () => {
    run.mockResolvedValue({ ok: false, error: 'relay refused the transaction' });
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    fireEvent.change(screen.getByLabelText('Log verbosity'), { target: { value: 'errors' } });
    expect(log()).toContain('relay refused the transaction');
    expect(log()).not.toContain(`balance of ${ADDR}`);
    expect(log()).not.toContain('No lines match this verbosity');
  });

  test('reset clears the session', async () => {
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(log()).toContain('mallchain console — ready.');
  });

  test('copy puts the whole session on the clipboard', async () => {
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(copied).toContain(`balance of ${ADDR}`);
    expect(copied).toContain('Done.');
  });

  test('a blocked clipboard is reported honestly and points at Export', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByText(/Clipboard is blocked/)).toBeTruthy());
  });

  test('export downloads a JSON session including the chain and signing address', async () => {
    const createObjectURL = vi.fn(() => 'blob:session');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }));
    const clicked: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') { clicked.push(el as HTMLAnchorElement); vi.spyOn(el, 'click').mockImplementation(() => {}); }
      return el;
    });

    mount();
    type(`balance of ${ADDR}`);
    await clickRun();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as unknown as Blob;
    const payload = JSON.parse(await blob.text());
    expect(payload.signingAddress).toBe(FROM);
    expect(payload.chainId).toBeTruthy();
    expect(payload.entries.some((e: { text: string }) => e.text.includes('balance of'))).toBe(true);
    expect(clicked[0].download).toMatch(/^mallchain-console-\d+\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:session');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('exporting an empty session says there is nothing to export', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Nothing to export yet')).toBeTruthy();
  });
});

describe('hand-off and remount', () => {
  test('a command handed over from the Deploy bench lands in the composer', () => {
    mount({ seed: { text: 'store wasm', id: 1 } });
    expect(composer().value).toBe('store wasm');
  });

  test('a new hand-off replaces the composer contents', () => {
    const { rerender } = mount({ seed: { text: 'store wasm', id: 1 } });
    rerender(
      <>
        <CommandConsole wasm={null} onOpenDeploy={() => {}} seed={{ text: 'deploy label "counter" init {"count":0}', id: 2 }} />
        <ToastHost />
      </>,
    );
    expect(composer().value).toBe('deploy label "counter" init {"count":0}');
  });

  test('StrictMode mount-unmount-remount leaves the console able to run', async () => {
    store.state.wallet.address = FROM;
    render(
      <StrictMode>
        <CommandConsole wasm={null} onOpenDeploy={() => {}} />
        <ToastHost />
      </StrictMode>,
    );
    type(`balance of ${ADDR}`);
    await clickRun();
    expect(run).toHaveBeenCalledTimes(1);
    expect(log()).toContain('Done.');
  });
});