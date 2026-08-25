/**
 * Client-side signing + broadcast for x/dex's MsgSwap. Mirrors
 * stakingDelegateTx.ts's pattern: this is a genuine end-user operation
 * (the swapper's own tokens move), so — unlike the operator-mnemonic-funded
 * liquidity add/remove in backend/src/services/dexTxBuilder.js — it must be
 * signed with the caller's own account key, never the server's.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import { createDexRegistry, MSG_SWAP, type MsgSwapValue } from './dexProto';

const DEFAULT_GAS_LIMIT = 250000;

export class DexTxError extends Error {}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new DexTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new DexTxError('This account has no on-chain history yet.');
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

async function signAndBroadcast(opts: { mnemonic: string; fromAddress: string; typeUrl: string; value: unknown }): Promise<{ txHash: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new DexTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createDexRegistry();
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

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>('/api/dex/broadcast', {
    txBytes: toBase64(txRawBytes),
  });
  if (!res.ok || !res.data?.txHash) {
    throw new DexTxError(res.error || res.data?.error || 'Swap failed during broadcast');
  }
  return { txHash: res.data.txHash };
}

/** Signs and broadcasts a real MsgSwap. `minTokenOut` is slippage protection — the chain rejects the swap if it can't deliver at least that much. */
export async function swap(opts: { mnemonic: string; fromAddress: string } & Omit<MsgSwapValue, 'sender'>): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_SWAP,
    value: {
      sender: opts.fromAddress,
      poolId: opts.poolId,
      tokenIn: opts.tokenIn,
      tokenOutDenom: opts.tokenOutDenom,
      minTokenOut: opts.minTokenOut,
    },
  });
}
