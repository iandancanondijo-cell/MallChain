/**
 * Client-side signing + broadcast for MsgStake/MsgUnstake — same offline
 * signing shape as mallcoinTx.ts (the chain RPC is localhost-only, so the
 * browser can never reach it directly; account/sequence come from the
 * backend's GET /api/send/account/:address, which is chain-agnostic and
 * already used for plain transfers).
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import { MSG_STAKE, MSG_UNSTAKE, createMlcoinRegistry } from './mlcoinProto';

const MLCNS_DECIMALS = 6;
const DEFAULT_GAS_LIMIT = 250000;

export class StakingTxError extends Error {}

interface AccountInfo {
  accountNumber: number;
  sequence: number;
}

async function fetchAccountInfo(address: string): Promise<AccountInfo> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) {
    throw new StakingTxError(res.error || 'Failed to fetch account info from the chain');
  }
  if (res.data.notFound) {
    throw new StakingTxError('This account has no on-chain history yet — it needs a small stake balance for gas first.');
  }
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

async function signAndBroadcast(opts: {
  mnemonic: string;
  fromAddress: string;
  typeUrl: string;
  value: Record<string, string>;
  broadcastPath: string;
}): Promise<{ txHash: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new StakingTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createMlcoinRegistry();
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

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>(opts.broadcastPath, { txBytes });
  if (!res.ok || !res.data?.txHash) {
    throw new StakingTxError(res.error || res.data?.error || 'Transaction failed during broadcast');
  }
  return { txHash: res.data.txHash };
}

/** Signs and broadcasts a real MsgStake, staking `amountMlcns` MLCNS. */
export async function stakeMlcns(opts: { mnemonic: string; fromAddress: string; amountMlcns: number }): Promise<{ txHash: string }> {
  const amountUnits = Math.floor(opts.amountMlcns * 10 ** MLCNS_DECIMALS).toString();
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_STAKE,
    value: { creator: opts.fromAddress, amount: amountUnits },
    broadcastPath: '/api/staking/stake',
  });
}

/** Signs and broadcasts a real MsgUnstake — pays out principal + rewards for that stake in one call. */
export async function unstake(opts: { mnemonic: string; fromAddress: string; stakeId: string }): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_UNSTAKE,
    value: { creator: opts.fromAddress, stakeId: opts.stakeId },
    broadcastPath: '/api/staking/unstake',
  });
}
