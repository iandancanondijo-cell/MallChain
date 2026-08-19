/**
 * Client-side signing + broadcast for real x/marketplace escrow actions
 * (create / release / open dispute). Same offline-signing pattern as
 * mallcoinTx.ts: the chain RPC is localhost-only, so we build and sign the
 * tx fully offline using account_number/sequence fetched from the backend,
 * then hand the signed txBytes to the backend's broadcast relay.
 *
 * Authorization (enforced on-chain, see x/marketplace/keeper/escrow.go):
 *  - CreateEscrow and OpenDispute must be signed by the buyer.
 *  - ReleaseFunds must be signed by the buyer (confirming receipt).
 *  - RefundBuyer must be signed by the seller — there's no seller-side
 *    client in this app, so it isn't exposed here; a buyer-side "cancel"
 *    can only ever be a dispute, not a unilateral refund.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import {
  MSG_CREATE_ESCROW,
  MSG_RELEASE_FUNDS,
  MSG_OPEN_DISPUTE,
  createMarketplaceRegistry,
  type MsgCreateEscrowValue,
  type MsgReleaseFundsValue,
  type MsgOpenDisputeValue,
} from './marketplaceProto';

const DEFAULT_GAS_LIMIT = 250000;

export class MarketplaceTxError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

interface AccountInfo {
  accountNumber: number;
  sequence: number;
}

async function fetchAccountInfo(address: string): Promise<AccountInfo> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) {
    throw new MarketplaceTxError(res.error || 'Failed to fetch account info from the chain');
  }
  if (res.data.notFound) {
    throw new MarketplaceTxError(
      'This account has no on-chain history yet — it needs a small stake balance for gas first.',
      'NO_ON_CHAIN_HISTORY'
    );
  }
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

async function signAndBroadcast(opts: {
  mnemonic: string;
  fromAddress: string;
  typeUrl: string;
  value: unknown;
}): Promise<string> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new MarketplaceTxError('The stored recovery phrase does not match this wallet\'s address.');
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createMarketplaceRegistry();
  const bodyBytes = registry.encodeTxBody({
    messages: [{ typeUrl: opts.typeUrl, value: opts.value }],
    memo: '',
  });

  const pubkey = encodePubkey({ type: 'tendermint/PubKeySecp256k1', value: toBase64(account.pubkey) });
  const fee = calculateFee(DEFAULT_GAS_LIMIT, GasPrice.fromString(chain.gasPrice));
  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey, sequence: BigInt(sequence) }],
    fee.amount,
    Number(fee.gas),
    undefined,
    undefined,
    SignMode.SIGN_MODE_DIRECT
  );

  const signDoc = makeSignDoc(bodyBytes, authInfoBytes, chain.chainId, accountNumber);
  const { signed, signature } = await wallet.signDirect(opts.fromAddress, signDoc);

  const txRawBytes = TxRaw.encode({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: [fromBase64(signature.signature)],
  }).finish();

  const txBytes = toBase64(txRawBytes);

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>('/api/marketplace/escrow/broadcast', {
    txBytes,
  });
  if (!res.ok || !res.data?.txHash) {
    throw new MarketplaceTxError(res.data?.error || res.error || 'Escrow transaction failed during broadcast');
  }
  return res.data.txHash;
}

function decodeEventAttr(value: string): string {
  try {
    const decoded = atob(value);
    // Proto3 JSON renders `bytes` fields as base64; plain event attributes
    // from newer SDK REST responses may already be plain strings. If the
    // "decoded" text contains control characters it almost certainly
    // wasn't base64 to begin with — fall back to the raw value.
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0e-\x1f]/.test(decoded)) return value;
    return decoded;
  } catch {
    return value;
  }
}

/** Polls GET /api/send/status/:txHash until the tx is included, then returns its events. */
async function waitForTxEvents(txHash: string, attempts = 8, delayMs = 1500): Promise<Array<{ type: string; attributes: Array<{ key: string; value: string }> }>> {
  for (let i = 0; i < attempts; i++) {
    const res = await api.get<{
      success: boolean;
      status: string;
      code?: number;
      events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
    }>(`/api/send/status/${txHash}`);

    if (res.ok && res.data?.status === 'confirmed') {
      if (res.data.code && res.data.code !== 0) {
        throw new MarketplaceTxError('Escrow transaction failed on-chain');
      }
      return res.data.events || [];
    }
    if (res.ok && res.data?.status === 'failed') {
      throw new MarketplaceTxError('Escrow transaction failed on-chain');
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new MarketplaceTxError('Timed out waiting for escrow transaction to confirm');
}

function findEventAttr(
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>,
  eventType: string,
  attrKey: string
): string | undefined {
  for (const ev of events) {
    if (ev.type !== eventType) continue;
    for (const attr of ev.attributes || []) {
      if (decodeEventAttr(attr.key) === attrKey) return decodeEventAttr(attr.value);
    }
  }
  return undefined;
}

export interface CreateEscrowResult {
  txHash: string;
  escrowId: string;
}

/** Signs, broadcasts, and confirms a MsgCreateEscrow — locks buyer funds for real. */
export async function createEscrow(opts: {
  mnemonic: string;
  buyer: string;
  seller: string;
  amount: string;
  denom: string;
  description: string;
  disputeWindowSeconds: number;
}): Promise<CreateEscrowResult> {
  const value: MsgCreateEscrowValue = {
    buyer: opts.buyer,
    seller: opts.seller,
    amount: opts.amount,
    denom: opts.denom,
    description: opts.description,
    disputeWindowSeconds: String(opts.disputeWindowSeconds),
  };
  const txHash = await signAndBroadcast({ mnemonic: opts.mnemonic, fromAddress: opts.buyer, typeUrl: MSG_CREATE_ESCROW, value });
  const events = await waitForTxEvents(txHash);
  const escrowId = findEventAttr(events, 'escrow_created', 'escrow_id');
  if (!escrowId) {
    throw new MarketplaceTxError('Escrow was created but its id could not be read back from the chain.');
  }
  return { txHash, escrowId };
}

/** Signs and broadcasts a MsgReleaseFunds — buyer confirms receipt, releasing funds to the seller. */
export async function releaseFunds(opts: { mnemonic: string; buyer: string; escrowId: string }): Promise<{ txHash: string }> {
  const value: MsgReleaseFundsValue = { escrowId: opts.escrowId, releaseBy: opts.buyer };
  const txHash = await signAndBroadcast({ mnemonic: opts.mnemonic, fromAddress: opts.buyer, typeUrl: MSG_RELEASE_FUNDS, value });
  await waitForTxEvents(txHash);
  return { txHash };
}

/** Signs and broadcasts a MsgOpenDispute — starts the escrow's dispute window. */
export async function openDispute(opts: { mnemonic: string; buyer: string; escrowId: string }): Promise<{ txHash: string }> {
  const value: MsgOpenDisputeValue = { escrowId: opts.escrowId, opener: opts.buyer };
  const txHash = await signAndBroadcast({ mnemonic: opts.mnemonic, fromAddress: opts.buyer, typeUrl: MSG_OPEN_DISPUTE, value });
  await waitForTxEvents(txHash);
  return { txHash };
}
