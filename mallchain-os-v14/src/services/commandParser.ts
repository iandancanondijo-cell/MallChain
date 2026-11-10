/**
 * Natural-language commands for the Developer Hub console.
 *
 * This is a deterministic local parser, not a model. It maps a sentence onto
 * one of the transaction builders that already exist in src/services, and it
 * refuses anything it cannot map exactly — a command that moves funds must
 * never be guessed at. The caller shows `describe()` and `params` to the person
 * before anything is signed, so what they approve is what runs.
 *
 * Amounts for MALL/MLCNS are whole coins: mallcoinTx multiplies by 10^6 itself.
 * Every other denom is passed through as the chain's smallest unit string,
 * exactly as the builder expects.
 */
import type { VoteOption } from './governanceTx';

export interface CoinValue { denom: string; amount: string }

export type CommandIntent =
  | { kind: 'balance'; address: string }
  | { kind: 'send'; toAddress: string; amountMlcns: number; memo: string }
  | { kind: 'stake'; amountMlcns: number }
  | { kind: 'unstake'; stakeId: string }
  | { kind: 'delegate'; validatorAddress: string; amount: string; denom: string }
  | { kind: 'undelegate'; validatorAddress: string; amount: string; denom: string }
  | { kind: 'vote'; proposalId: string; option: VoteOption }
  | { kind: 'propose'; title: string; summary: string; initialDepositAmount: string; denom: string }
  | { kind: 'swap'; poolId: number; tokenIn: CoinValue; tokenOutDenom: string; minTokenOut: CoinValue }
  | { kind: 'escrow'; seller: string; amount: string; denom: string; description: string; disputeWindowSeconds: number }
  | { kind: 'release'; escrowId: string }
  | { kind: 'dispute'; escrowId: string }
  | { kind: 'storeCode' }
  | { kind: 'instantiate'; codeId: string; label: string; initMsg: Record<string, unknown> }
  | { kind: 'deploy'; label: string; initMsg: Record<string, unknown> }
  | { kind: 'execute'; contractAddress: string; executeMsg: Record<string, unknown> };

export type CommandKind = CommandIntent['kind'];

/** read = no signature; write = changes chain state; funds = moves value. */
export type CommandRisk = 'read' | 'write' | 'funds';

export interface ParsedCommand {
  intent: CommandIntent;
  risk: CommandRisk;
  /** One sentence saying exactly what will happen, shown before signing. */
  summary: string;
  /** The builder this runs, so the console can name it rather than imply magic. */
  builder: string;
  /** True when the command needs a .wasm attached before it can run. */
  needsWasm: boolean;
  needsMnemonic: boolean;
}

export interface ParseFailure {
  error: string;
  /** The corrected form, when there is one obvious thing to add. */
  hint?: string;
}

export type ParseResult = { ok: true; command: ParsedCommand } | { ok: false } & ParseFailure;

const ADDRESS_RE = /^mall1[0-9a-z]{20,80}$/;
const VALOPER_RE = /^mallvaloper1[0-9a-z]{20,80}$/;
const DENOM_RE = /^[a-zA-Z][a-zA-Z0-9/:._-]{1,63}$/;

const VOTE_WORDS: Record<string, VoteOption> = {
  yes: 'VOTE_OPTION_YES', for: 'VOTE_OPTION_YES',
  no: 'VOTE_OPTION_NO', against: 'VOTE_OPTION_NO',
  abstain: 'VOTE_OPTION_ABSTAIN',
  veto: 'VOTE_OPTION_NO_WITH_VETO', no_with_veto: 'VOTE_OPTION_NO_WITH_VETO', 'no-with-veto': 'VOTE_OPTION_NO_WITH_VETO',
};

/**
 * Example commands shown in the DevHub console.
 *
 * The addresses are shaped like real ones (`mall1…`, bech32 character set) so
 * the parser accepts them, but they are not accounts anyone controls: a click
 * fills the composer, and if the user goes on to sign, the chain rejects the
 * checksum. They used to be genesis wallet addresses from the chain config,
 * which meant a one-tap example could send real MALL to a funded account.
 */
export const COMMAND_EXAMPLES: Array<{ text: string; note: string }> = [
  { text: 'balance of mall1examplepeeraddressxxxxxxxxxxxxxxxxxx', note: 'Read a balance — no signature, nothing changes.' },
  { text: 'send 25 MALL to mall1examplereceiveraddressxxxxxxxxxxx', note: 'A real transfer, signed on this device.' },
  { text: 'send 10 MALL to mall1examplereceiveraddressxxxxxxxxxxx memo invoice 42', note: 'The memo is written into the transaction.' },
  { text: 'stake 100 MALL', note: 'Stakes to the protocol staking module.' },
  { text: 'delegate 50 stake to mallvaloper1examplevalidatoraddressxxxxxxxxx', note: 'Delegates to one validator.' },
  { text: 'vote yes on proposal 12', note: 'Casts a governance vote.' },
  { text: 'swap 100 stake for umall in pool 1 min 90 umall', note: 'A DEX swap with a minimum output.' },
  { text: 'escrow 20 stake with mall1examplereceiveraddressxxxxxxxxxxx for "design work"', note: 'Opens a marketplace escrow.' },
  { text: 'deploy label "counter" init {"count":0}', note: 'Stores the attached .wasm, then instantiates it.' },
  { text: 'execute mall1examplecontractaddressxxxxxxxxxxxxxxxxx {"increment":{}}', note: 'Calls a deployed contract.' },
];

const POLITENESS = /^(please|hey|ok|okay|can you|could you|would you|i want to|i'd like to|let's|lets)\s+/i;

/** Collapse whitespace and drop leading politeness so "please can you send…" parses. */
function normalize(input: string): string {
  let text = input.replace(/\s+/g, ' ').trim();
  // Politeness stacks ("please could you"), so strip until none is left.
  while (POLITENESS.test(text)) text = text.replace(POLITENESS, '').trim();
  return text.replace(/\s+please$/i, '').trim();
}

/** A quoted phrase, double or single. Returns the inside without the quotes. */
function quoted(text: string, index: number): { value: string; end: number } | null {
  const open = text[index];
  if (open !== '"' && open !== "'") return null;
  const close = text.indexOf(open, index + 1);
  if (close === -1) return null;
  return { value: text.slice(index + 1, close), end: close + 1 };
}

/**
 * The JSON object at the end of a command. Contract messages are JSON and may
 * contain spaces and quotes, so this takes everything from the first `{` or `[`
 * to the end rather than trying to tokenise around it.
 */
function trailingJson(text: string): { value: Record<string, unknown>; rest: string } | { error: string } | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const body = text.slice(start).trim();
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'a contract message must be a JSON object, like {"increment":{}}' };
    }
    return { value: parsed as Record<string, unknown>, rest: text.slice(0, start).trim() };
  } catch {
    return { error: `that JSON does not parse: ${body.slice(0, 60)}` };
  }
}

function amount(raw: string | undefined, what: string): { value: number } | { error: string } {
  if (!raw) return { error: `${what} needs an amount, like "send 25 MALL to mall1…"` };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { error: `"${raw}" is not a positive amount` };
  if (n > 1e12) return { error: 'that amount is larger than this console will sign' };
  return { value: n };
}

/** Whole coins may carry decimals; smallest-unit denoms must be whole strings. */
function unitAmount(raw: string | undefined, what: string): { value: string } | { error: string } {
  if (!raw) return { error: `${what} needs an amount in the chain's smallest unit` };
  if (!/^\d+$/.test(raw)) return { error: `"${raw}" must be a whole number of smallest units (no decimals)` };
  if (/^0+$/.test(raw)) return { error: 'the amount must be greater than zero' };
  if (raw.length > 30) return { error: 'that amount is larger than this console will sign' };
  return { value: raw };
}

function denom(raw: string | undefined): { value: string } | { error: string } {
  if (!raw) return { error: 'name the denom, like "stake" or "umall"' };
  const d = raw.toLowerCase();
  if (!DENOM_RE.test(d)) return { error: `"${raw}" is not a valid denom` };
  return { value: d };
}

function address(raw: string | undefined, what: string): { value: string } | { error: string } {
  if (!raw) return { error: `${what} needs a mall1… address` };
  const a = raw.toLowerCase().replace(/[.,;]$/, '');
  if (!ADDRESS_RE.test(a)) return { error: `"${raw}" is not a Mallchain address (it should start mall1 and be bech32)` };
  return { value: a };
}

const fail = (error: string, hint?: string): ParseResult => ({ ok: false, error, hint });

function describe(intent: CommandIntent, from: string): string {
  switch (intent.kind) {
    case 'balance': return `Read the balance of ${intent.address}. Nothing is signed and nothing changes.`;
    // MALL is the name the whole app uses for this coin — header, balances,
    // Send screen — and the word the user just typed. MLCNS is the same coin
    // under its on-chain ticker and the name of the API field, so it stays in
    // the technical builder line, not in the sentence a person signs against.
    case 'send': return `Send ${intent.amountMlcns} MALL from ${from || yourWallet()} to ${intent.toAddress}${intent.memo ? `, with the memo “${intent.memo}”` : ''}. This moves real funds.`;
    case 'stake': return `Stake ${intent.amountMlcns} MALL from ${from || yourWallet()} into the protocol staking module.`;
    case 'unstake': return `Unstake position ${intent.stakeId} owned by ${from || yourWallet()}.`;
    case 'delegate': return `Delegate ${intent.amount} ${intent.denom} from ${from || yourWallet()} to validator ${intent.validatorAddress}.`;
    case 'undelegate': return `Undelegate ${intent.amount} ${intent.denom} from validator ${intent.validatorAddress} back to ${from || yourWallet()}.`;
    case 'vote': return `Vote ${intent.option.replace('VOTE_OPTION_', '').toLowerCase().replace(/_/g, ' ')} on proposal ${intent.proposalId} as ${from || yourWallet()}.`;
    case 'propose': return `Submit the governance proposal “${intent.title}” with a deposit of ${intent.initialDepositAmount} ${intent.denom}.`;
    case 'swap': return `Swap ${intent.tokenIn.amount} ${intent.tokenIn.denom} for at least ${intent.minTokenOut.amount} ${intent.minTokenOut.denom} in pool ${intent.poolId}. The swap fails on-chain if the minimum cannot be met.`;
    case 'escrow': return `Open an escrow holding ${intent.amount} ${intent.denom} from ${from || yourWallet()} for seller ${intent.seller}, described as “${intent.description}”, with a ${intent.disputeWindowSeconds}-second dispute window.`;
    case 'release': return `Release escrow ${intent.escrowId} to its seller. This moves real funds.`;
    case 'dispute': return `Open a dispute on escrow ${intent.escrowId}, freezing its release.`;
    case 'storeCode': return `Store the attached .wasm on chain as a new code ID, uploaded by ${from || yourWallet()}. Nothing is instantiated yet.`;
    case 'instantiate': return `Instantiate code ${intent.codeId} as “${intent.label}” with the message ${JSON.stringify(intent.initMsg)}, owned by ${from || yourWallet()}.`;
    case 'deploy': return `Store the attached .wasm, then instantiate it as “${intent.label}” with ${JSON.stringify(intent.initMsg)}. Two transactions, both signed by ${from || yourWallet()}.`;
    case 'execute': return `Call ${intent.contractAddress} with ${JSON.stringify(intent.executeMsg)} as ${from || yourWallet()}.`;
  }
}

const yourWallet = () => 'your connected wallet';

const RISK: Record<CommandKind, CommandRisk> = {
  balance: 'read',
  send: 'funds', stake: 'funds', unstake: 'funds', delegate: 'funds', undelegate: 'funds',
  escrow: 'funds', release: 'funds', swap: 'funds',
  vote: 'write', propose: 'funds', dispute: 'write',
  storeCode: 'write', instantiate: 'write', deploy: 'write', execute: 'write',
};

const BUILDER: Record<CommandKind, string> = {
  balance: 'walletApi.getBalance',
  send: 'mallcoinTx.sendMallcoinTransfer',
  stake: 'stakingTx.stakeMlcns',
  unstake: 'stakingTx.unstake',
  delegate: 'stakingDelegateTx.delegate',
  undelegate: 'stakingDelegateTx.undelegate',
  vote: 'governanceTx.castVote',
  propose: 'governanceTx.submitProposal',
  swap: 'dexTx.swap',
  escrow: 'marketplaceTx.createEscrow',
  release: 'marketplaceTx.releaseFunds',
  dispute: 'marketplaceTx.openDispute',
  storeCode: 'wasmTx.storeCode',
  instantiate: 'wasmTx.instantiateContract',
  deploy: 'wasmTx.deployContract',
  execute: 'wasmTx.executeContract',
};

const WASM_KINDS: CommandKind[] = ['storeCode', 'deploy'];

function wrap(intent: CommandIntent, from: string): ParseResult {
  return {
    ok: true,
    command: {
      intent,
      risk: RISK[intent.kind],
      summary: describe(intent, from),
      builder: BUILDER[intent.kind],
      needsWasm: WASM_KINDS.includes(intent.kind),
      needsMnemonic: intent.kind !== 'balance',
    },
  };
}

/**
 * Parse one command. `from` is only used to word the confirmation sentence — it
 * is never substituted into a parameter the person did not type.
 */
export function parseCommand(input: string, from = ''): ParseResult {
  const text = normalize(input);
  if (!text) return fail('Type a command, or pick one of the examples below.');
  if (/^(help|\?|commands|what can you do)$/i.test(text)) {
    return fail('This console runs one command at a time.', 'Try: send 25 MALL to mall1… · stake 100 MALL · vote yes on proposal 12 · deploy label "counter" init {"count":0}');
  }

  let m: RegExpMatchArray | null;

  // ---- reads -------------------------------------------------------------
  if ((m = /^(?:what(?:'s| is) the |check |show |read |get )?(?:the )?balance(?: of| for)?\s+(\S+)$/i.exec(text))
    || (m = /^how much (?:does|is in)\s+(\S+)\s+(?:have|hold|own)\??$/i.exec(text))) {
    const a = address(m[1], 'a balance read');
    if ('error' in a) return fail(a.error);
    return wrap({ kind: 'balance', address: a.value }, from);
  }

  // ---- transfers ---------------------------------------------------------
  if ((m = /^(?:send|transfer|pay)\s+([\d.]+)\s*(?:mall|mlcns|mlcoin)?\s+(?:to|towards)\s+(\S+)(.*)$/i.exec(text))) {
    const n = amount(m[1], 'a transfer');
    if ('error' in n) return fail(n.error);
    const a = address(m[2], 'a transfer');
    if ('error' in a) return fail(a.error, `send ${m[1]} MALL to mall1…`);
    const tail = (m[3] || '').trim();
    let memo = '';
    if (tail) {
      const memoMatch = /^(?:with\s+)?memo\s+(.+)$/i.exec(tail);
      if (!memoMatch) return fail(`I did not understand “${tail}” after the address.`, 'Only a memo can follow the address: send 25 MALL to mall1… memo invoice 42');
      memo = memoMatch[1].replace(/^["']|["']$/g, '').slice(0, 256);
    }
    return wrap({ kind: 'send', toAddress: a.value, amountMlcns: n.value, memo }, from);
  }
  if (/^(send|transfer|pay)\b/i.test(text)) {
    return fail('A transfer needs an amount and a recipient.', 'send 25 MALL to mall1qv9pzxqlyckngw6zf9g9whn9d3eh4qvg6yv336');
  }

  // ---- staking -----------------------------------------------------------
  if ((m = /^stake\s+([\d.]+)\s*(?:mall|mlcns)?$/i.exec(text))) {
    const n = amount(m[1], 'staking');
    if ('error' in n) return fail(n.error);
    return wrap({ kind: 'stake', amountMlcns: n.value }, from);
  }
  if (/^stake\b/i.test(text)) return fail('Staking needs an amount.', 'stake 100 MALL');

  if ((m = /^unstake\s+(\S+)$/i.exec(text))) {
    const id = m[1].replace(/[.,;]$/, '');
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(id)) return fail(`"${m[1]}" is not a stake ID.`);
    return wrap({ kind: 'unstake', stakeId: id }, from);
  }
  if (/^unstake\b/i.test(text)) return fail('Unstaking needs the stake ID you want to close.', 'unstake stake-17');

  if ((m = /^(delegate|undelegate|unbond)\s+([\d.]+)\s+(\S+)\s+(?:to|from)\s+(\S+)$/i.exec(text))) {
    const verb = m[1].toLowerCase();
    const amt = unitAmount(m[2], verb);
    if ('error' in amt) return fail(amt.error);
    const d = denom(m[3]);
    if ('error' in d) return fail(d.error);
    const v = m[4].toLowerCase().replace(/[.,;]$/, '');
    if (!VALOPER_RE.test(v)) return fail(`"${m[4]}" is not a validator address (it should start mallvaloper1).`);
    return wrap({ kind: verb === 'delegate' ? 'delegate' : 'undelegate', validatorAddress: v, amount: amt.value, denom: d.value }, from);
  }
  if (/^(delegate|undelegate|unbond)\b/i.test(text)) {
    return fail('Delegation needs an amount, a denom and a validator.', 'delegate 50 stake to mallvaloper1…');
  }

  // ---- governance --------------------------------------------------------
  if ((m = /^vote\s+(no[\s_-]+with[\s_-]+veto|\S+)\s+(?:on\s+)?(?:proposal\s+)?#?(\d+)$/i.exec(text))) {
    const option = VOTE_WORDS[m[1].toLowerCase().replace(/\s+/g, '_')];
    if (!option) return fail(`"${m[1]}" is not a vote option.`, 'Use yes, no, abstain or veto.');
    return wrap({ kind: 'vote', proposalId: m[2], option }, from);
  }
  if (/^vote\b/i.test(text)) return fail('A vote needs an option and a proposal number.', 'vote yes on proposal 12');

  if ((m = /^propose\s+(.+)$/i.exec(text))) {
    const body = m[1];
    const q = quoted(body, 0);
    if (!q) return fail('A proposal needs a quoted title.', 'propose "Fund the explorer" : Add a public indexer deposit 1000 stake');
    const rest = body.slice(q.end).trim();
    const summaryMatch = /^:?\s*(.+?)\s+deposit\s+([\d.]+)\s+(\S+)$/i.exec(rest);
    if (!summaryMatch) return fail('After the title, give a summary and a deposit.', 'propose "Fund the explorer" : Add a public indexer deposit 1000 stake');
    const amt = unitAmount(summaryMatch[2], 'a proposal deposit');
    if ('error' in amt) return fail(amt.error);
    const d = denom(summaryMatch[3]);
    if ('error' in d) return fail(d.error);
    if (q.value.trim().length < 4) return fail('The proposal title is too short.');
    if (summaryMatch[1].trim().length < 10) return fail('The proposal summary needs at least 10 characters.');
    return wrap({ kind: 'propose', title: q.value.trim().slice(0, 200), summary: summaryMatch[1].trim().slice(0, 2000), initialDepositAmount: amt.value, denom: d.value }, from);
  }

  // ---- dex ---------------------------------------------------------------
  if ((m = /^swap\s+([\d.]+)\s+(\S+)\s+for\s+(\S+)\s+in\s+pool\s+(\d+)\s+min(?:imum)?\s+([\d.]+)\s+(\S+)$/i.exec(text))) {
    const inAmt = unitAmount(m[1], 'a swap');
    if ('error' in inAmt) return fail(inAmt.error);
    const inDenom = denom(m[2]);
    if ('error' in inDenom) return fail(inDenom.error);
    const outDenom = denom(m[3]);
    if ('error' in outDenom) return fail(outDenom.error);
    const minAmt = unitAmount(m[5], 'a swap minimum');
    if ('error' in minAmt) return fail(minAmt.error);
    const minDenom = denom(m[6]);
    if ('error' in minDenom) return fail(minDenom.error);
    if (minDenom.value !== outDenom.value) return fail(`The minimum must be in the token you receive (${outDenom.value}), not ${minDenom.value}.`);
    const poolId = Number(m[4]);
    if (!Number.isInteger(poolId) || poolId < 0) return fail('The pool ID must be a whole number.');
    return wrap({ kind: 'swap', poolId, tokenIn: { denom: inDenom.value, amount: inAmt.value }, tokenOutDenom: outDenom.value, minTokenOut: { denom: minDenom.value, amount: minAmt.value } }, from);
  }
  if (/^swap\b/i.test(text)) {
    return fail('A swap needs both sides, a pool and a minimum output.', 'swap 100 stake for umall in pool 1 min 90 umall');
  }

  // ---- marketplace -------------------------------------------------------
  if ((m = /^(?:create\s+|open\s+)?escrow\s+([\d.]+)\s+(\S+)\s+with\s+(\S+)\s+for\s+(.+)$/i.exec(text))) {
    const amt = unitAmount(m[1], 'an escrow');
    if ('error' in amt) return fail(amt.error);
    const d = denom(m[2]);
    if ('error' in d) return fail(d.error);
    const seller = address(m[3], 'an escrow');
    if ('error' in seller) return fail(seller.error);
    const tail = m[4].trim();
    const q = quoted(tail, 0);
    const description = (q ? q.value : tail).trim();
    if (description.length < 4) return fail('Describe what the escrow is for.', 'escrow 20 stake with mall1… for "design work"');
    let disputeWindowSeconds = 7 * 86400;
    const after = q ? tail.slice(q.end).trim() : '';
    if (after) {
      const w = /^(?:dispute(?:\s+window)?|window)\s+(\d+)\s*(s|sec|secs|seconds|h|hours?|d|days?)?$/i.exec(after);
      if (!w) return fail(`I did not understand “${after}”.`, 'Only a dispute window can follow the description: … for "design work" dispute 3 days');
      const n = Number(w[1]);
      const unit = (w[2] || 's').toLowerCase();
      disputeWindowSeconds = unit.startsWith('d') ? n * 86400 : unit.startsWith('h') ? n * 3600 : n;
      if (!Number.isInteger(disputeWindowSeconds) || disputeWindowSeconds < 60 || disputeWindowSeconds > 365 * 86400) {
        return fail('The dispute window must be between one minute and one year.');
      }
    }
    return wrap({ kind: 'escrow', seller: seller.value, amount: amt.value, denom: d.value, description: description.slice(0, 500), disputeWindowSeconds }, from);
  }
  if (/^(?:create\s+|open\s+)?escrow\b/i.test(text)) {
    return fail('An escrow needs an amount, a denom, a seller and a description.', 'escrow 20 stake with mall1… for "design work"');
  }

  if ((m = /^(release|dispute)\s+(?:escrow\s+)?(\S+)$/i.exec(text))) {
    const id = m[2].replace(/[.,;]$/, '');
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(id)) return fail(`"${m[2]}" is not an escrow ID.`);
    return wrap({ kind: m[1].toLowerCase() === 'release' ? 'release' : 'dispute', escrowId: id }, from);
  }

  // ---- wasm --------------------------------------------------------------
  if (/^(?:store|upload)\s+(?:the\s+|this\s+)?(?:wasm|code|contract)(?:\s+(?:code|bytecode|file))?$/i.test(text)) {
    return wrap({ kind: 'storeCode' }, from);
  }

  if ((m = /^(?:instantiate|init)\s+(?:code\s+)?(\d+)(.*)$/i.exec(text))) {
    const rest = m[2].trim();
    const labelMatch = /^label\s+("[^"]*"|'[^']*'|\S+)(.*)$/i.exec(rest);
    if (!labelMatch) return fail('Instantiating needs a label.', 'instantiate 41 label "counter" init {"count":0}');
    const label = labelMatch[1].replace(/^["']|["']$/g, '');
    const tail = labelMatch[2].trim().replace(/^init\s*/i, '');
    const json = tail ? trailingJson(tail) : null;
    if (json && 'error' in json) return fail(json.error);
    if (label.length < 1 || label.length > 128) return fail('The label must be between 1 and 128 characters.');
    return wrap({ kind: 'instantiate', codeId: m[1], label, initMsg: json && 'value' in json ? json.value : {} }, from);
  }

  if (/^deploy\b/i.test(text) || /^(?:store and instantiate|upload and instantiate)\b/i.test(text)) {
    const body = text.replace(/^(deploy|store and instantiate|upload and instantiate)\s*/i, '').trim();
    const labelMatch = /^label\s+("[^"]*"|'[^']*'|\S+)(.*)$/i.exec(body);
    let label = 'contract';
    let rest = body;
    if (labelMatch) {
      label = labelMatch[1].replace(/^["']|["']$/g, '');
      rest = labelMatch[2].trim();
    }
    rest = rest.replace(/^init\s*/i, '').trim();
    const json = rest ? trailingJson(rest) : null;
    if (json && 'error' in json) return fail(json.error);
    if (label.length < 1 || label.length > 128) return fail('The label must be between 1 and 128 characters.');
    return wrap({ kind: 'deploy', label, initMsg: json && 'value' in json ? json.value : {} }, from);
  }

  if ((m = /^(?:execute|call|run)\s+(?:contract\s+)?(\S+)\s*(.*)$/i.exec(text))) {
    const a = address(m[1], 'a contract call');
    if ('error' in a) return fail(a.error);
    const tail = m[2].trim().replace(/^(?:with|msg|message)\s*/i, '');
    const json = tail ? trailingJson(tail) : null;
    if (json && 'error' in json) return fail(json.error);
    if (!json) return fail('A contract call needs a JSON message.', 'execute mall1… {"increment":{}}');
    return wrap({ kind: 'execute', contractAddress: a.value, executeMsg: 'value' in json ? json.value : {} }, from);
  }

  return fail(`I could not map “${text.slice(0, 80)}” onto a transaction.`, 'This console understands: balance, send, stake, unstake, delegate, undelegate, vote, propose, swap, escrow, release, dispute, store wasm, instantiate, deploy, execute.');
}