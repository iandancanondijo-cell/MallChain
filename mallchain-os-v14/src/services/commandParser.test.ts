import { describe, expect, test } from 'vitest';
import { COMMAND_EXAMPLES, parseCommand, type ParsedCommand } from './commandParser';

const ADDR = 'mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336';
const OTHER = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const VAL = 'mallvaloper1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';
const FROM = 'mall1senderaddressxxxxxxxxxxxxxxxxxxxxxx';

function ok(input: string, from = ''): ParsedCommand {
  const r = parseCommand(input, from);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got: ${r.error}`);
  return r.command;
}

function bad(input: string): { error: string; hint?: string } {
  const r = parseCommand(input);
  if (r.ok) throw new Error(`expected "${input}" to be refused, got ${r.command.intent.kind}`);
  return { error: r.error, hint: r.hint };
}

describe('reads', () => {
  test('a balance read needs no signature and changes nothing', () => {
    const c = ok(`balance of ${ADDR}`);
    expect(c.intent).toEqual({ kind: 'balance', address: ADDR });
    expect(c.risk).toBe('read');
    expect(c.needsMnemonic).toBe(false);
    expect(c.needsWasm).toBe(false);
    expect(c.builder).toBe('walletApi.getBalance');
    expect(c.summary).toContain('Nothing is signed');
  });

  test('polite and verbose phrasings normalise to the same intent', () => {
    for (const text of [
      `please check the balance of ${ADDR}`,
      `please could you check the balance of ${ADDR}`,
      `Can you show balance for ${ADDR} please`,
      `what's the balance of ${ADDR}`,
      `how much does ${ADDR} have?`,
    ]) {
      expect(ok(text).intent).toEqual({ kind: 'balance', address: ADDR });
    }
  });

  test('a balance read still validates the address', () => {
    expect(bad('balance of cosmos1abc').error).toContain('not a Mallchain address');
  });
});

describe('transfers', () => {
  test('amounts are whole coins, because mallcoinTx multiplies by 10^6 itself', () => {
    const c = ok(`send 25 MALL to ${ADDR}`, FROM);
    expect(c.intent).toEqual({ kind: 'send', toAddress: ADDR, amountMlcns: 25, memo: '' });
    expect(c.risk).toBe('funds');
    expect(c.needsMnemonic).toBe(true);
    expect(c.builder).toBe('mallcoinTx.sendMallcoinTransfer');
    expect(c.summary).toContain(`from ${FROM}`);
    expect(c.summary).toContain('moves real funds');
  });

  test('a memo is carried through, not dropped', () => {
    const c = ok(`send 10 MALL to ${ADDR} memo invoice 42`);
    expect(c.intent.kind === 'send' && c.intent.memo).toBe('invoice 42');
    expect(c.summary).toContain('invoice 42');
  });

  test('the denom word is optional and case-insensitive', () => {
    expect(ok(`TRANSFER 3 mlcns TO ${ADDR}`).intent.kind).toBe('send');
    expect(ok(`pay 3 to ${ADDR}`).intent.kind).toBe('send');
  });

  test('anything other than a memo after the address is refused', () => {
    const r = bad(`send 5 MALL to ${ADDR} and also stake it`);
    expect(r.error).toContain('after the address');
    expect(r.hint).toContain('memo');
  });

  test('a malformed transfer gets the corrected form, not a guess', () => {
    const r = bad('send MALL to somebody');
    expect(r.hint).toContain(`send 25 MALL to ${ADDR}`);
    expect(bad(`send 5 MALL to ${OTHER.slice(0, 12)}`).hint).toContain('send 5 MALL to mall1…');
  });

  test('non-positive and absurd amounts are refused', () => {
    expect(bad(`send 0 MALL to ${ADDR}`).error).toContain('not a positive amount');
    expect(bad(`send 999999999999999 MALL to ${ADDR}`).error).toContain('larger than this console will sign');
  });
});

describe('staking and delegation', () => {
  test('stake and unstake', () => {
    expect(ok('stake 100 MALL').intent).toEqual({ kind: 'stake', amountMlcns: 100 });
    expect(ok('unstake stake-17').intent).toEqual({ kind: 'unstake', stakeId: 'stake-17' });
    expect(bad('stake').hint).toBe('stake 100 MALL');
    expect(bad('unstake').hint).toBe('unstake stake-17');
  });

  test('delegation amounts are smallest-unit strings and must be whole', () => {
    const c = ok(`delegate 50 stake to ${VAL}`);
    expect(c.intent).toEqual({ kind: 'delegate', validatorAddress: VAL, amount: '50', denom: 'stake' });
    expect(c.risk).toBe('funds');
    expect(bad(`delegate 50.5 stake to ${VAL}`).error).toContain('no decimals');
    expect(bad(`delegate 0 stake to ${VAL}`).error).toContain('greater than zero');
  });

  test('undelegate and unbond both map to undelegate', () => {
    expect(ok(`undelegate 50 stake from ${VAL}`).intent.kind).toBe('undelegate');
    expect(ok(`unbond 50 stake from ${VAL}`).intent.kind).toBe('undelegate');
  });

  test('a validator address must be mallvaloper1, not mall1', () => {
    expect(bad(`delegate 50 stake to ${ADDR}`).error).toContain('mallvaloper1');
    expect(bad('delegate 50').hint).toBe('delegate 50 stake to mallvaloper1…');
  });
});

describe('governance', () => {
  test('vote words map onto the real VoteOption enum', () => {
    expect(ok('vote yes on proposal 12').intent).toEqual({ kind: 'vote', proposalId: '12', option: 'VOTE_OPTION_YES' });
    const against = ok('vote against proposal #3');
    expect(against.intent.kind === 'vote' && against.intent.option).toBe('VOTE_OPTION_NO');
    expect(against.intent.kind === 'vote' && against.intent.proposalId).toBe('3');
    const veto = ok('vote veto on proposal 4');
    expect(veto.intent.kind === 'vote' && veto.intent.option).toBe('VOTE_OPTION_NO_WITH_VETO');
    expect(ok('vote abstain on 9').risk).toBe('write');
  });

  test('"on" is optional and the veto option survives its three-word spelling', () => {
    expect(ok('vote yes proposal 12').intent).toEqual({ kind: 'vote', proposalId: '12', option: 'VOTE_OPTION_YES' });
    for (const text of ['vote no with veto on proposal 5', 'vote no-with-veto proposal 5', 'vote no_with_veto on 5']) {
      const c = ok(text);
      expect(c.intent.kind === 'vote' && c.intent.option, text).toBe('VOTE_OPTION_NO_WITH_VETO');
      expect(c.intent.kind === 'vote' && c.intent.proposalId, text).toBe('5');
    }
  });

  test('an unknown vote word is refused with the allowed set', () => {
    expect(bad('vote maybe on proposal 1').hint).toBe('Use yes, no, abstain or veto.');
    expect(bad('vote yes').hint).toBe('vote yes on proposal 12');
  });

  test('a proposal needs a quoted title, a summary and a deposit', () => {
    const c = ok('propose "Fund the explorer" : Add a public indexer deposit 1000 stake');
    expect(c.intent).toEqual({
      kind: 'propose', title: 'Fund the explorer', summary: 'Add a public indexer',
      initialDepositAmount: '1000', denom: 'stake',
    });
    expect(c.risk).toBe('funds');
    expect(bad('propose Fund the explorer deposit 1000 stake').error).toContain('quoted title');
    expect(bad('propose "A title" : short deposit 1000 stake').error).toContain('at least 10 characters');
    expect(bad('propose "Hi" : A long enough summary deposit 1000 stake').error).toContain('title is too short');
    expect(bad('propose "A title" : A long enough summary deposit 1.5 stake').error).toContain('no decimals');
  });
});

describe('dex', () => {
  test('a swap carries both sides, the pool and the minimum output', () => {
    const c = ok('swap 100 stake for umall in pool 1 min 90 umall');
    expect(c.intent).toEqual({
      kind: 'swap', poolId: 1,
      tokenIn: { denom: 'stake', amount: '100' },
      tokenOutDenom: 'umall',
      minTokenOut: { denom: 'umall', amount: '90' },
    });
    expect(c.risk).toBe('funds');
    expect(c.summary).toContain('fails on-chain if the minimum cannot be met');
  });

  test('a minimum in the wrong token is refused', () => {
    expect(bad('swap 100 stake for umall in pool 1 min 90 stake').error).toContain('token you receive (umall)');
    expect(bad('swap 100 stake').hint).toBe('swap 100 stake for umall in pool 1 min 90 umall');
    expect(bad('swap 1.5 stake for umall in pool 1 min 1 umall').error).toContain('no decimals');
    expect(bad('swap 100 stake for umall in pool 1 min 0.5 umall').error).toContain('no decimals');
  });
});

describe('marketplace', () => {
  test('an escrow defaults to a seven-day dispute window', () => {
    const c = ok(`escrow 20 stake with ${ADDR} for "design work"`);
    expect(c.intent).toEqual({
      kind: 'escrow', seller: ADDR, amount: '20', denom: 'stake',
      description: 'design work', disputeWindowSeconds: 7 * 86400,
    });
    expect(c.builder).toBe('marketplaceTx.createEscrow');
  });

  test('an explicit window is converted to seconds and bounded', () => {
    const c = ok(`open escrow 20 stake with ${ADDR} for "design work" dispute 3 days`);
    expect(c.intent.kind === 'escrow' && c.intent.disputeWindowSeconds).toBe(3 * 86400);
    expect(bad(`escrow 20 stake with ${ADDR} for "work" dispute 30 seconds`).error).toContain('between one minute and one year');
    expect(bad(`escrow 20 stake with ${ADDR} for "work" and then release it`).hint).toContain('dispute 3 days');
    expect(bad(`escrow 2.5 stake with ${ADDR} for "design work"`).error).toContain('no decimals');
  });

  test('release moves funds, dispute only freezes', () => {
    expect(ok('release escrow esc-9').risk).toBe('funds');
    expect(ok('dispute esc-9').risk).toBe('write');
    expect(ok('release escrow esc-9').intent).toEqual({ kind: 'release', escrowId: 'esc-9' });
  });
});

describe('wasm', () => {
  test('store and deploy are the only commands that need an attached module', () => {
    const store = ok('store wasm');
    expect(store.intent.kind).toBe('storeCode');
    expect(store.needsWasm).toBe(true);
    expect(store.needsMnemonic).toBe(true);
    expect(store.risk).toBe('write');

    const deploy = ok('deploy label "counter" init {"count":0}');
    expect(deploy.intent).toEqual({ kind: 'deploy', label: 'counter', initMsg: { count: 0 } });
    expect(deploy.needsWasm).toBe(true);
    expect(deploy.summary).toContain('Two transactions');

    expect(ok(`instantiate 41 label "counter" init {"count":0}`).needsWasm).toBe(false);
    expect(ok(`execute ${ADDR} {"increment":{}}`).needsWasm).toBe(false);
  });

  test('instantiate keeps the code ID and label the developer typed', () => {
    const c = ok('instantiate code 41 label counter init {"count": 7, "owner": "ada"}');
    expect(c.intent).toEqual({ kind: 'instantiate', codeId: '41', label: 'counter', initMsg: { count: 7, owner: 'ada' } });
    expect(bad('instantiate 41 {"count":0}').hint).toBe('instantiate 41 label "counter" init {"count":0}');
  });

  test('deploy without a label falls back to "contract", never to a guess about funds', () => {
    expect(ok('deploy init {"count":0}').intent).toEqual({ kind: 'deploy', label: 'contract', initMsg: { count: 0 } });
    expect(ok('store and instantiate label "x"').intent.kind).toBe('deploy');
  });

  test('a contract call needs a JSON object message', () => {
    const c = ok(`execute ${ADDR} {"increment":{}}`);
    expect(c.intent).toEqual({ kind: 'execute', contractAddress: ADDR, executeMsg: { increment: {} } });
    expect(bad(`execute ${ADDR}`).hint).toBe('execute mall1… {"increment":{}}');
    expect(bad(`execute ${ADDR} [1,2]`).error).toContain('must be a JSON object');
    expect(bad(`execute ${ADDR} {broken`).error).toContain('does not parse');
    expect(ok(`call contract ${ADDR} with msg {"a":1}`).intent).toEqual({ kind: 'execute', contractAddress: ADDR, executeMsg: { a: 1 } });
  });
});

describe('refusal is the default', () => {
  test('an unmappable sentence lists what the console does understand', () => {
    const r = bad('make me rich');
    expect(r.error).toContain('could not map');
    expect(r.hint).toContain('balance, send, stake');
  });

  test('empty input and help are answered, not executed', () => {
    expect(bad('   ').error).toContain('Type a command');
    expect(bad('help').hint).toContain('send 25 MALL');
  });

  test('every shipped example parses', () => {
    for (const example of COMMAND_EXAMPLES) {
      const r = parseCommand(example.text);
      expect(r.ok, `${example.text} → ${r.ok ? '' : r.error}`).toBe(true);
    }
  });

  test('the signing address words the summary but is never injected into a parameter', () => {
    const c = ok(`send 5 MALL to ${ADDR}`, FROM);
    expect(c.summary).toContain(FROM);
    expect(c.intent.kind === 'send' && c.intent.toAddress).toBe(ADDR);
    const anon = ok(`send 5 MALL to ${ADDR}`);
    expect(anon.summary).toContain('your connected wallet');
  });

  test('only a balance read runs without the recovery phrase', () => {
    const signing = [
      `send 1 MALL to ${ADDR}`, 'stake 1 MALL', 'unstake s1', `delegate 1 stake to ${VAL}`,
      'vote yes on proposal 1', 'propose "A title" : A long enough summary deposit 1 stake',
      'swap 1 stake for umall in pool 1 min 1 umall', `escrow 1 stake with ${ADDR} for "work"`,
      'release e1', 'dispute e1', 'store wasm', 'instantiate 1 label x', 'deploy', `execute ${ADDR} {"a":{}}`,
    ];
    for (const text of signing) expect(ok(text).needsMnemonic, text).toBe(true);
    expect(ok(`balance of ${ADDR}`).needsMnemonic).toBe(false);
  });
});