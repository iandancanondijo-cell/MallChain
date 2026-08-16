/**
 * Client-side signing + broadcast for real Cosmos SDK x/staking MsgDelegate
 * / MsgUndelegate — separate from stakingTx.ts, which is this platform's
 * unrelated custom MLCNS reward-pool staking (x/mlcoin). Real delegation is
 * what actually gives an address weight in x/gov proposal tallies.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc, Registry } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice, defaultRegistryTypes } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { MsgDelegate, MsgUndelegate } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import { api } from './api';
import { chain } from './config';

const DEFAULT_GAS_LIMIT = 250000;

export class DelegateTxError extends Error {}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new DelegateTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new DelegateTxError('This account has no on-chain history yet.');
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
    throw new DelegateTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = new Registry(defaultRegistryTypes);
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

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>('/api/staking/broadcast', { txBytes });
  if (!res.ok || !res.data?.txHash) {
    throw new DelegateTxError(res.error || res.data?.error || 'Transaction failed during broadcast');
  }
  return { txHash: res.data.txHash };
}

/** Signs and broadcasts a real MsgDelegate — bonds `amount` (base denom units) to a validator. */
export async function delegate(opts: {
  mnemonic: string;
  fromAddress: string;
  validatorAddress: string;
  amount: string;
  denom: string;
}): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
    value: MsgDelegate.fromPartial({
      delegatorAddress: opts.fromAddress,
      validatorAddress: opts.validatorAddress,
      amount: { denom: opts.denom, amount: opts.amount },
    }),
  });
}

/** Signs and broadcasts a real MsgUndelegate — begins unbonding `amount` from a validator. */
export async function undelegate(opts: {
  mnemonic: string;
  fromAddress: string;
  validatorAddress: string;
  amount: string;
  denom: string;
}): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: '/cosmos.staking.v1beta1.MsgUndelegate',
    value: MsgUndelegate.fromPartial({
      delegatorAddress: opts.fromAddress,
      validatorAddress: opts.validatorAddress,
      amount: { denom: opts.denom, amount: opts.amount },
    }),
  });
}
