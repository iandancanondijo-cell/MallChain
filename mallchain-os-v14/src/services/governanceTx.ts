/**
 * Client-side signing + broadcast for real Cosmos SDK x/gov messages
 * (MsgVote, MsgSubmitProposal) — same offline signing shape as
 * mallcoinTx.ts/stakingTx.ts. Uses the chain's real, already-registered
 * cosmos.gov.v1 module (not a custom module — this chain's x/governance
 * scaffold was never wired into app.go, so a hand-rolled encoder for it
 * would sign transactions the chain can't route). defaultRegistryTypes
 * from @cosmjs/stargate already knows how to encode these, so no custom
 * proto registry is needed here.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc, Registry } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice, defaultRegistryTypes } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { MsgVote, MsgSubmitProposal } from 'cosmjs-types/cosmos/gov/v1/tx';
import { api } from './api';
import { chain } from './config';
import { estimateGas } from './gasEstimation';
import { broadcastWithRetry } from './broadcastWithRetry';
import { waitForConfirmation } from './txConfirmation';

const PLACEHOLDER_GAS_LIMIT = 0;

export type VoteOption = 'VOTE_OPTION_YES' | 'VOTE_OPTION_ABSTAIN' | 'VOTE_OPTION_NO' | 'VOTE_OPTION_NO_WITH_VETO';

const VOTE_OPTION_NUMBER: Record<VoteOption, number> = {
  VOTE_OPTION_YES: 1,
  VOTE_OPTION_ABSTAIN: 2,
  VOTE_OPTION_NO: 3,
  VOTE_OPTION_NO_WITH_VETO: 4,
};

export class GovernanceTxError extends Error {}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new GovernanceTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new GovernanceTxError('This account has no on-chain history yet.');
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

async function signAndBroadcast(opts: {
  mnemonic: string;
  fromAddress: string;
  typeUrl: string;
  value: unknown;
}): Promise<{ txHash: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new GovernanceTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = new Registry(defaultRegistryTypes);
  const bodyBytes = registry.encodeTxBody({
    messages: [{ typeUrl: opts.typeUrl, value: opts.value }],
    memo: '',
  });

  const pubkey = encodePubkey({ type: 'tendermint/PubKeySecp256k1', value: toBase64(account.pubkey) });

  // Build unsigned tx with placeholder fee for simulation
  const placeholderFee = calculateFee(PLACEHOLDER_GAS_LIMIT, GasPrice.fromString(chain.gasPrice));
  const placeholderAuthInfoBytes = makeAuthInfoBytes(
    [{ pubkey, sequence: BigInt(sequence) }],
    placeholderFee.amount,
    Number(placeholderFee.gas),
    undefined,
    undefined,
    SignMode.SIGN_MODE_DIRECT
  );

  const placeholderTxRaw = TxRaw.encode({
    bodyBytes,
    authInfoBytes: placeholderAuthInfoBytes,
    signatures: [new Uint8Array()],
  }).finish();

  // Estimate gas via backend simulation
  const gasLimit = await estimateGas(toBase64(placeholderTxRaw));

  // Rebuild with estimated gas
  const fee = calculateFee(gasLimit, GasPrice.fromString(chain.gasPrice));
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

  let data;
  try {
    data = await broadcastWithRetry('/api/governance/broadcast', { txBytes });
  } catch (err) {
    throw new GovernanceTxError(err instanceof Error ? err.message : 'Transaction failed during broadcast');
  }
  await waitForConfirmation(data.txHash);
  return { txHash: data.txHash };
}

/** Signs and broadcasts a real MsgVote for the given proposal. */
export async function castVote(opts: {
  mnemonic: string;
  fromAddress: string;
  proposalId: string;
  option: VoteOption;
}): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: '/cosmos.gov.v1.MsgVote',
    value: MsgVote.fromPartial({
      proposalId: BigInt(opts.proposalId),
      voter: opts.fromAddress,
      option: VOTE_OPTION_NUMBER[opts.option],
      metadata: '',
    }),
  });
}

/** Signs and broadcasts a real MsgSubmitProposal (a "signal"/text proposal — no executable messages). */
export async function submitProposal(opts: {
  mnemonic: string;
  fromAddress: string;
  title: string;
  summary: string;
  initialDepositAmount: string; // base denom units (e.g. "10000000" = 10 STAKE)
  denom: string;
}): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: '/cosmos.gov.v1.MsgSubmitProposal',
    value: MsgSubmitProposal.fromPartial({
      // A signal/text proposal (no executable messages) must still carry
      // non-empty metadata — the chain rejects a proposal with both
      // `messages` and `metadata` nil/empty ("no messages proposed").
      messages: [],
      initialDeposit: [{ denom: opts.denom, amount: opts.initialDepositAmount }],
      proposer: opts.fromAddress,
      metadata: `signal-proposal:${opts.title.slice(0, 60)}`,
      title: opts.title,
      summary: opts.summary,
      expedited: false,
    }),
  });
}
