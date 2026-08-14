/**
 * Client-side signing + broadcast for MsgVote — same offline signing shape
 * as mallcoinTx.ts / stakingTx.ts.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import { MSG_VOTE, createGovernanceRegistry, type VoteOption } from './governanceProto';

const DEFAULT_GAS_LIMIT = 200000;

export class GovernanceTxError extends Error {}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new GovernanceTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new GovernanceTxError('This account has no on-chain history yet.');
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

/** Signs and broadcasts a real MsgVote for the given proposal. */
export async function castVote(opts: {
  mnemonic: string;
  fromAddress: string;
  proposalId: string;
  option: VoteOption;
}): Promise<{ txHash: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new GovernanceTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createGovernanceRegistry();
  const bodyBytes = registry.encodeTxBody({
    messages: [
      {
        typeUrl: MSG_VOTE,
        value: { proposalId: opts.proposalId, voter: opts.fromAddress, option: opts.option, metadata: '' },
      },
    ],
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

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>('/api/governance/vote', { txBytes });
  if (!res.ok || !res.data?.txHash) {
    throw new GovernanceTxError(res.error || res.data?.error || 'Vote failed during broadcast');
  }
  return { txHash: res.data.txHash };
}
