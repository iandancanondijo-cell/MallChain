import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runCommand, type LogFn, type RunContext } from './commandRunner';
import { parseCommand, type ParsedCommand } from './commandParser';
import { walletApi } from './walletApi';
import { sendMallcoinTransfer } from './mallcoinTx';
import { stakeMlcns, unstake } from './stakingTx';
import { delegate, undelegate } from './stakingDelegateTx';
import { castVote, submitProposal } from './governanceTx';
import { swap } from './dexTx';
import { createEscrow, releaseFunds, openDispute } from './marketplaceTx';
import { storeCode, instantiateContract, executeContract, deployContract } from './wasmTx';

vi.mock('./walletApi', () => ({ walletApi: { getBalance: vi.fn() } }));
vi.mock('./mallcoinTx', () => ({ sendMallcoinTransfer: vi.fn() }));
vi.mock('./stakingTx', () => ({ stakeMlcns: vi.fn(), unstake: vi.fn() }));
vi.mock('./stakingDelegateTx', () => ({ delegate: vi.fn(), undelegate: vi.fn() }));
vi.mock('./governanceTx', () => ({ castVote: vi.fn(), submitProposal: vi.fn() }));
vi.mock('./dexTx', () => ({ swap: vi.fn() }));
vi.mock('./marketplaceTx', () => ({ createEscrow: vi.fn(), releaseFunds: vi.fn(), openDispute: vi.fn() }));
vi.mock('./wasmTx', () => ({ storeCode: vi.fn(), instantiateContract: vi.fn(), executeContract: vi.fn(), deployContract: vi.fn() }));

const ADDR = 'mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336';
const VAL = 'mallvaloper1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const FROM = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const PHRASE = 'twelve word recovery phrase that must never reach the log';
const WASM = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

const builders = {
  sendMallcoinTransfer: vi.mocked(sendMallcoinTransfer),
  stakeMlcns: vi.mocked(stakeMlcns), unstake: vi.mocked(unstake),
  delegate: vi.mocked(delegate), undelegate: vi.mocked(undelegate),
  castVote: vi.mocked(castVote), submitProposal: vi.mocked(submitProposal),
  swap: vi.mocked(swap),
  createEscrow: vi.mocked(createEscrow), releaseFunds: vi.mocked(releaseFunds), openDispute: vi.mocked(openDispute),
  storeCode: vi.mocked(storeCode), instantiateContract: vi.mocked(instantiateContract),
  executeContract: vi.mocked(executeContract), deployContract: vi.mocked(deployContract),
  getBalance: vi.mocked(walletApi.getBalance),
};

function command(text: string): ParsedCommand {
  const r = parseCommand(text, FROM);
  if (!r.ok) throw new Error(r.error);
  return r.command;
}

function context(over: Partial<RunContext> = {}): RunContext & { lines: Array<[string, string]> } {
  const lines: Array<[string, string]> = [];
  const log: LogFn = (level, msg) => { lines.push([level, msg]); };
  return { fromAddress: FROM, mnemonic: PHRASE, wasm: WASM, wasmName: 'counter.wasm', log, lines, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(builders)) fn.mockResolvedValue({ txHash: 'ABCD1234' } as never);
  builders.getBalance.mockResolvedValue({
    ok: true,
    data: { address: ADDR, MALL: '12.5', MLPTS: 300, MALL_LOCKED: '2', USD_M: '1.25' },
  } as never);
  builders.createEscrow.mockResolvedValue({ txHash: 'ESCROWTX', escrowId: 'esc-77' } as never);
  builders.storeCode.mockResolvedValue({ txHash: 'STORETX', codeId: '41' } as never);
  builders.instantiateContract.mockResolvedValue({ txHash: 'INITTX', address: ADDR } as never);
  builders.deployContract.mockResolvedValue({ storeTxHash: 'STORETX', codeId: '41', instantiateTxHash: 'INITTX', address: ADDR } as never);
});

describe('the gates before anything is signed', () => {
  test('a balance read runs with no wallet and no phrase', async () => {
    const ctx = context({ fromAddress: '', mnemonic: null });
    const r = await runCommand(command(`balance of ${ADDR}`), ctx);
    expect(r.ok).toBe(true);
    expect(builders.getBalance).toHaveBeenCalledWith(ADDR);
    expect(ctx.lines.some(([level, msg]) => level === 'ok' && msg.includes('MALL 12.5') && msg.includes('MLPTS 300') && msg.includes('locked 2'))).toBe(true);
    expect(r.ok && r.data).toEqual({ address: ADDR, MALL: '12.5', MLPTS: 300, MALL_LOCKED: '2', USD_M: '1.25' });
    for (const fn of Object.values(builders)) if (fn !== builders.getBalance) expect(fn).not.toHaveBeenCalled();
  });

  test('a failed balance read reports the API error, not a zero', async () => {
    builders.getBalance.mockResolvedValue({ ok: false, error: 'wallet API unreachable' } as never);
    const r = await runCommand(command(`balance of ${ADDR}`), context());
    expect(r).toEqual({ ok: false, error: 'wallet API unreachable' });
  });

  test('a balance payload with no figures is a failed read, not a Done line', async () => {
    // What a stub or a partial response really looks like: HTTP 200, no fields.
    builders.getBalance.mockResolvedValue({ ok: true, data: {} } as never);
    const ctx = context();
    const r = await runCommand(command(`balance of ${ADDR}`), ctx);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('returned no balance figures');
    expect(ctx.lines.map(([, m]) => m).join(' ')).not.toContain('undefined');
  });

  test('no connected wallet blocks every signing command before the builder is touched', async () => {
    const r = await runCommand(command(`send 5 MALL to ${ADDR}`), context({ fromAddress: '' }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('Connect a wallet');
    expect(builders.sendMallcoinTransfer).not.toHaveBeenCalled();
  });

  test('store and deploy refuse to run without an attached module', async () => {
    for (const text of ['store wasm', 'deploy label "counter" init {"count":0}']) {
      const r = await runCommand(command(text), context({ wasm: null }));
      expect(r.ok === false && r.error, text).toContain('Attach a compiled .wasm');
    }
    expect(builders.storeCode).not.toHaveBeenCalled();
    expect(builders.deployContract).not.toHaveBeenCalled();
  });

  test('a cancelled cipher wall sends nothing and says so', async () => {
    const r = await runCommand(command(`send 5 MALL to ${ADDR}`), context({ mnemonic: null }));
    expect(r.ok === false && r.error).toContain('cancelled at the cipher wall');
    expect(builders.sendMallcoinTransfer).not.toHaveBeenCalled();
  });

  test('instantiate and execute do not need a module, only a signature', async () => {
    const ctx = context({ wasm: null });
    expect((await runCommand(command('instantiate 41 label "counter"'), ctx)).ok).toBe(true);
    expect((await runCommand(command(`execute ${ADDR} {"increment":{}}`), ctx)).ok).toBe(true);
  });
});

describe('each command reaches its real builder with exactly the parsed parameters', () => {
  const cases: Array<[string, keyof typeof builders, Record<string, unknown>]> = [
    [`send 25 MALL to ${ADDR} memo invoice 42`, 'sendMallcoinTransfer', { mnemonic: PHRASE, fromAddress: FROM, toAddress: ADDR, amountMlcns: 25, memo: 'invoice 42' }],
    ['stake 100 MALL', 'stakeMlcns', { mnemonic: PHRASE, fromAddress: FROM, amountMlcns: 100 }],
    ['unstake stake-17', 'unstake', { mnemonic: PHRASE, fromAddress: FROM, stakeId: 'stake-17' }],
    [`delegate 50 stake to ${VAL}`, 'delegate', { mnemonic: PHRASE, fromAddress: FROM, validatorAddress: VAL, amount: '50', denom: 'stake' }],
    [`undelegate 50 stake from ${VAL}`, 'undelegate', { mnemonic: PHRASE, fromAddress: FROM, validatorAddress: VAL, amount: '50', denom: 'stake' }],
    ['vote yes on proposal 12', 'castVote', { mnemonic: PHRASE, fromAddress: FROM, proposalId: '12', option: 'VOTE_OPTION_YES' }],
    ['propose "Fund the explorer" : Add a public indexer deposit 1000 stake', 'submitProposal', { mnemonic: PHRASE, fromAddress: FROM, title: 'Fund the explorer', summary: 'Add a public indexer', initialDepositAmount: '1000', denom: 'stake' }],
    ['swap 100 stake for umall in pool 1 min 90 umall', 'swap', { mnemonic: PHRASE, fromAddress: FROM, poolId: 1, tokenIn: { denom: 'stake', amount: '100' }, tokenOutDenom: 'umall', minTokenOut: { denom: 'umall', amount: '90' } }],
    [`escrow 20 stake with ${ADDR} for "design work"`, 'createEscrow', { mnemonic: PHRASE, buyer: FROM, seller: ADDR, amount: '20', denom: 'stake', description: 'design work', disputeWindowSeconds: 604800 }],
    ['release escrow esc-9', 'releaseFunds', { mnemonic: PHRASE, buyer: FROM, escrowId: 'esc-9' }],
    ['dispute esc-9', 'openDispute', { mnemonic: PHRASE, buyer: FROM, escrowId: 'esc-9' }],
    ['store wasm', 'storeCode', { mnemonic: PHRASE, sender: FROM, wasmByteCode: WASM }],
    ['instantiate 41 label "counter" init {"count":0}', 'instantiateContract', { mnemonic: PHRASE, sender: FROM, codeId: '41', label: 'counter', initMsg: { count: 0 } }],
    ['deploy label "counter" init {"count":0}', 'deployContract', { mnemonic: PHRASE, sender: FROM, wasmByteCode: WASM, label: 'counter', initMsg: { count: 0 } }],
    [`execute ${ADDR} {"increment":{}}`, 'executeContract', { mnemonic: PHRASE, sender: FROM, contractAddress: ADDR, executeMsg: { increment: {} } }],
  ];

  for (const [text, name, expected] of cases) {
    test(text, async () => {
      const ctx = context();
      const r = await runCommand(command(text), ctx);
      expect(builders[name]).toHaveBeenCalledTimes(1);
      expect(builders[name]).toHaveBeenCalledWith(expected);
      expect(r.ok).toBe(true);
      expect(ctx.lines.some(([level, msg]) => level === 'info' && msg.includes('(…)') && msg.includes(`from ${FROM}`))).toBe(true);
    });
  }

  test('the uploaded bytes are the inspected bytes, not a re-read of the file', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await runCommand(command('store wasm'), context({ wasm: bytes, wasmName: 'other.wasm' }));
    expect(builders.storeCode.mock.calls[0][0].wasmByteCode).toBe(bytes);
  });

  test('deploy reports both transactions and the resulting address', async () => {
    const ctx = context();
    const r = await runCommand(command('deploy label "counter" init {"count":0}'), ctx);
    expect(r.ok && r.data).toEqual({ storeTxHash: 'STORETX', codeId: '41', instantiateTxHash: 'INITTX', address: ADDR });
    expect(ctx.lines.filter(([level]) => level === 'ok')).toHaveLength(2);
    expect(ctx.lines.some(([, msg]) => msg.includes('Step 1 of 2'))).toBe(true);
    expect(ctx.lines.some(([, msg]) => msg.includes('Step 2 of 2'))).toBe(true);
  });
});

describe('what the console prints', () => {
  test('a command that moves value is warned about before it is built', async () => {
    const ctx = context();
    await runCommand(command(`send 5 MALL to ${ADDR}`), ctx);
    const warnAt = ctx.lines.findIndex(([level]) => level === 'warn');
    const callAt = ctx.lines.findIndex(([, msg]) => msg.includes('Building MsgTransferMallcoin'));
    expect(warnAt).toBeGreaterThanOrEqual(0);
    expect(callAt).toBeGreaterThan(warnAt);
    expect(ctx.lines[warnAt][1]).toContain('moves value');
  });

  test('a read-only contract call is not dressed up as a funds movement', async () => {
    const ctx = context();
    await runCommand(command('vote yes on proposal 1'), ctx);
    expect(ctx.lines.some(([level]) => level === 'warn')).toBe(false);
  });

  test('the recovery phrase never appears in a single log line', async () => {
    for (const text of [`send 5 MALL to ${ADDR}`, 'store wasm', 'deploy', `execute ${ADDR} {"a":1}`, 'stake 1 MALL']) {
      const ctx = context();
      await runCommand(command(text), ctx);
      for (const [, msg] of ctx.lines) expect(msg).not.toContain(PHRASE);
    }
  });

  test('a real builder failure is surfaced verbatim, never replaced with a success', async () => {
    builders.sendMallcoinTransfer.mockRejectedValue(new Error('no chain node is reachable from this stub'));
    const ctx = context();
    const r = await runCommand(command(`send 5 MALL to ${ADDR}`), ctx);
    expect(r).toEqual({ ok: false, error: 'no chain node is reachable from this stub' });
    expect(ctx.lines.some(([level, msg]) => level === 'error' && msg === 'no chain node is reachable from this stub')).toBe(true);
    expect(ctx.lines.some(([level]) => level === 'ok')).toBe(false);
  });

  test('a non-Error rejection still produces a readable message', async () => {
    builders.swap.mockRejectedValue('pool 1 is closed');
    const r = await runCommand(command('swap 100 stake for umall in pool 1 min 90 umall'), context());
    expect(r).toEqual({ ok: false, error: 'pool 1 is closed' });
  });

  test('result rows keep scalars, stringify booleans and drop nested objects', async () => {
    builders.executeContract.mockResolvedValue({ txHash: 'T1', height: 42, success: true, events: [{ a: 1 }], nothing: null } as never);
    const r = await runCommand(command(`execute ${ADDR} {"a":1}`), context());
    expect(r.ok && r.data).toEqual({ txHash: 'T1', height: 42, success: 'yes' });
  });
});