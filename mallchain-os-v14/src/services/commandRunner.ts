/**
 * Runs a parsed natural-language command against the real transaction builders.
 *
 * There is no interpreter and no server-side executor: every branch below calls
 * the same signing function the corresponding app screen calls, with the exact
 * parameters the parser extracted. Progress is reported through `log` so the
 * console shows what actually happened — including the real failure text when
 * the chain or the relay refuses the transaction.
 */
import type { ParsedCommand } from './commandParser';
import { walletApi } from './walletApi';
import { sendMallcoinTransfer } from './mallcoinTx';
import { stakeMlcns, unstake } from './stakingTx';
import { delegate, undelegate } from './stakingDelegateTx';
import { castVote, submitProposal } from './governanceTx';
import { swap } from './dexTx';
import { createEscrow, releaseFunds, openDispute } from './marketplaceTx';
import { storeCode, instantiateContract, executeContract, deployContract } from './wasmTx';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export type LogFn = (level: LogLevel, text: string) => void;

export interface RunContext {
  fromAddress: string;
  /** Present only after the cipher wall has been passed. */
  mnemonic: string | null;
  /** The inspected .wasm, required by storeCode / deploy. */
  wasm?: Uint8Array | null;
  wasmName?: string;
  log: LogFn;
}

export type RunOutcome =
  | { ok: true; data: Record<string, string | number> }
  | { ok: false; error: string };

const text = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Turns a builder result into the flat, copyable rows the console prints. */
function rows(value: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 'yes' : 'no';
  }
  return out;
}

export async function runCommand(command: ParsedCommand, ctx: RunContext): Promise<RunOutcome> {
  const { intent, risk } = command;
  const log = ctx.log;

  if (intent.kind === 'balance') {
    log('info', `Reading ${intent.address} from the wallet API…`);
    const res = await walletApi.getBalance(intent.address);
    if (!res.ok || !res.data) return { ok: false, error: res.error || 'The balance read failed.' };
    const b = res.data;
    // An empty or unexpected payload is a failed read, not a balance of undefined.
    if (typeof b.MALL !== 'number' && typeof b.MLPTS !== 'number') {
      return { ok: false, error: `The wallet API returned no balance figures for ${intent.address}.` };
    }
    log('ok', `MALL ${b.MALL} · MLPTS ${b.MLPTS}${b.MALL_LOCKED ? ` · locked ${b.MALL_LOCKED}` : ''}`);
    return { ok: true, data: rows({ address: b.address, MALL: b.MALL, MLPTS: b.MLPTS, MALL_LOCKED: b.MALL_LOCKED ?? 0, USD_M: b.USD_M }) };
  }

  if (!ctx.fromAddress) {
    return { ok: false, error: 'Connect a wallet before running a command that signs. Profile → Wallet, or the Send screen.' };
  }
  if (command.needsWasm && !ctx.wasm) {
    return { ok: false, error: 'Attach a compiled .wasm first — the Deploy tab inspects it and hands the bytes to this console.' };
  }
  if (command.needsMnemonic && !ctx.mnemonic) {
    return { ok: false, error: 'Signing was cancelled at the cipher wall, so nothing was sent.' };
  }
  const mnemonic = ctx.mnemonic as string;
  const from = ctx.fromAddress;

  if (risk === 'funds') log('warn', 'This command moves value. Signing offline on this device, then relaying to the chain.');
  log('info', `${command.builder}(…) · from ${from}`);

  try {
    switch (intent.kind) {
      case 'send': {
        log('info', `Building MsgTransferMallcoin · ${intent.amountMlcns} MLCNS → ${intent.toAddress}`);
        const r = await sendMallcoinTransfer({ mnemonic, fromAddress: from, toAddress: intent.toAddress, amountMlcns: intent.amountMlcns, memo: intent.memo });
        log('ok', `Broadcast ${r.txHash}${r.height ? ` · included at height ${r.height}` : ''}`);
        return { ok: true, data: rows({ ...r }) };
      }
      case 'stake': {
        const r = await stakeMlcns({ mnemonic, fromAddress: from, amountMlcns: intent.amountMlcns });
        log('ok', `Staked · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'unstake': {
        const r = await unstake({ mnemonic, fromAddress: from, stakeId: intent.stakeId });
        log('ok', `Unstaked ${intent.stakeId} · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'delegate': {
        const r = await delegate({ mnemonic, fromAddress: from, validatorAddress: intent.validatorAddress, amount: intent.amount, denom: intent.denom });
        log('ok', `Delegated ${intent.amount} ${intent.denom} · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'undelegate': {
        const r = await undelegate({ mnemonic, fromAddress: from, validatorAddress: intent.validatorAddress, amount: intent.amount, denom: intent.denom });
        log('ok', `Unbonding started · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'vote': {
        const r = await castVote({ mnemonic, fromAddress: from, proposalId: intent.proposalId, option: intent.option });
        log('ok', `Vote recorded · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'propose': {
        const r = await submitProposal({ mnemonic, fromAddress: from, title: intent.title, summary: intent.summary, initialDepositAmount: intent.initialDepositAmount, denom: intent.denom });
        log('ok', `Proposal submitted · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'swap': {
        const r = await swap({ mnemonic, fromAddress: from, poolId: intent.poolId, tokenIn: intent.tokenIn, tokenOutDenom: intent.tokenOutDenom, minTokenOut: intent.minTokenOut });
        log('ok', `Swap executed · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'escrow': {
        const r = await createEscrow({ mnemonic, buyer: from, seller: intent.seller, amount: intent.amount, denom: intent.denom, description: intent.description, disputeWindowSeconds: intent.disputeWindowSeconds });
        log('ok', `Escrow ${r.escrowId} funded · tx ${r.txHash}`);
        return { ok: true, data: rows({ ...r }) };
      }
      case 'release': {
        const r = await releaseFunds({ mnemonic, buyer: from, escrowId: intent.escrowId });
        log('ok', `Escrow released · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'dispute': {
        const r = await openDispute({ mnemonic, buyer: from, escrowId: intent.escrowId });
        log('ok', `Dispute opened · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      case 'storeCode': {
        const bytes = ctx.wasm as Uint8Array;
        log('info', `Uploading ${ctx.wasmName || 'module'} (${bytes.length} bytes) as MsgStoreCode…`);
        const r = await storeCode({ mnemonic, sender: from, wasmByteCode: bytes });
        log('ok', `Stored as code ${r.codeId} · tx ${r.txHash}`);
        return { ok: true, data: rows({ ...r }) };
      }
      case 'instantiate': {
        const r = await instantiateContract({ mnemonic, sender: from, codeId: intent.codeId, label: intent.label, initMsg: intent.initMsg });
        log('ok', `Contract live at ${r.address} · tx ${r.txHash}`);
        return { ok: true, data: rows({ ...r }) };
      }
      case 'deploy': {
        const bytes = ctx.wasm as Uint8Array;
        log('info', `Step 1 of 2 · MsgStoreCode (${bytes.length} bytes)`);
        const r = await deployContract({ mnemonic, sender: from, wasmByteCode: bytes, label: intent.label, initMsg: intent.initMsg });
        log('ok', `Code ${r.codeId} stored · tx ${r.storeTxHash}`);
        log('ok', `Step 2 of 2 · instantiated at ${r.address} · tx ${r.instantiateTxHash}`);
        return { ok: true, data: rows({ ...r }) };
      }
      case 'execute': {
        const r = await executeContract({ mnemonic, sender: from, contractAddress: intent.contractAddress, executeMsg: intent.executeMsg });
        log('ok', `Contract call confirmed · tx ${r.txHash}`);
        return { ok: true, data: rows(r) };
      }
      default:
        return { ok: false, error: 'That command has no builder wired up.' };
    }
  } catch (e) {
    const message = text(e);
    log('error', message);
    return { ok: false, error: message };
  }
}