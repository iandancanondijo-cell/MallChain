/**
 * Client-side signing + broadcast for real MALL (MLCNS) transfers.
 *
 * The chain's RPC (26657) is intentionally bound to localhost only (see
 * blockchain_working/config/config.toml), so the browser can never reach it
 * directly — SigningStargateClient.connectWithSigner() is not an option here.
 * Instead we build and sign the transaction fully offline (DirectSecp256k1HdWallet
 * never needs a network connection to sign) using account_number/sequence fetched
 * from the backend's GET /api/send/account/:address, then hand the signed
 * txBytes to the backend's POST /api/send/mallcoins, which just broadcasts them.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import { MSG_TRANSFER_MALLCOIN, createMlcoinRegistry } from './mlcoinProto';

const MLCNS_DECIMALS = 6;
const DEFAULT_GAS_LIMIT = 250000;

export class MallcoinTxError extends Error {}

interface AccountInfo {
  accountNumber: number;
  sequence: number;
}

async function fetchAccountInfo(address: string): Promise<AccountInfo> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) {
    throw new MallcoinTxError(res.error || 'Failed to fetch account info from the chain');
  }
  if (res.data.notFound) {
    throw new MallcoinTxError('This account has no on-chain history yet — it needs a small stake balance for gas before it can send.');
  }
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

/** Derives the signing wallet from a stored mnemonic and signs a MsgTransferMallcoin, fully offline. */
async function buildSignedTxBytes(opts: {
  mnemonic: string;
  fromAddress: string;
  toAddress: string;
  amountMlcns: number;
  memo?: string;
}): Promise<string> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new MallcoinTxError('The stored recovery phrase does not match this wallet\'s address.');
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const amountUnits = Math.floor(opts.amountMlcns * 10 ** MLCNS_DECIMALS).toString();
  const registry = createMlcoinRegistry();
  const bodyBytes = registry.encodeTxBody({
    messages: [
      {
        typeUrl: MSG_TRANSFER_MALLCOIN,
        value: { creator: opts.fromAddress, to: opts.toAddress, amount: amountUnits },
      },
    ],
    memo: opts.memo || '',
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

  return toBase64(txRawBytes);
}

export interface SendMallcoinResult {
  txHash: string;
  from: string;
  to: string;
  amount: number;
}

/** Signs and broadcasts a real MALL transfer. Throws MallcoinTxError with a user-facing message on failure. */
export async function sendMallcoinTransfer(opts: {
  mnemonic: string;
  fromAddress: string;
  toAddress: string;
  amountMlcns: number;
  memo?: string;
}): Promise<SendMallcoinResult> {
  const txBytes = await buildSignedTxBytes(opts);

  const res = await api.post<{ success: boolean; txHash: string }>('/api/send/mallcoins', {
    from: opts.fromAddress,
    to: opts.toAddress,
    amount: opts.amountMlcns,
    txBytes,
  });

  if (!res.ok || !res.data?.txHash) {
    throw new MallcoinTxError(res.error || 'Transaction failed during broadcast');
  }

  return {
    txHash: res.data.txHash,
    from: opts.fromAddress,
    to: opts.toAddress,
    amount: opts.amountMlcns,
  };
}
