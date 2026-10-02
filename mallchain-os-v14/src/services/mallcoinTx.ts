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
import { estimateGas } from './gasEstimation';
import { broadcastWithRetry } from './broadcastWithRetry';
import { waitForConfirmation } from './txConfirmation';
import { MSG_TRANSFER_MALLCOIN, createMlcoinRegistry } from './mlcoinProto';

const MLCNS_DECIMALS = 6;
const PLACEHOLDER_GAS_LIMIT = 0;

export class MallcoinTxError extends Error {
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
    throw new MallcoinTxError(res.error || 'Failed to fetch account info from the chain');
  }
  if (res.data.notFound) {
    throw new MallcoinTxError(
      'This account has no on-chain history yet — it needs a small stake balance for gas before it can send.',
      'NO_ON_CHAIN_HISTORY'
    );
  }
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

/** Derives the signing wallet from a stored mnemonic and signs a MsgTransferMallcoin, fully offline. */
export async function buildSignedTxBytes(opts: {
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

  let data;
  try {
    data = await broadcastWithRetry('/api/send/mallcoins', {
      from: opts.fromAddress,
      to: opts.toAddress,
      amount: opts.amountMlcns,
      txBytes,
    });
  } catch (err) {
    throw new MallcoinTxError(err instanceof Error ? err.message : 'Transaction failed during broadcast');
  }

  await waitForConfirmation(data.txHash);

  return {
    txHash: data.txHash,
    from: opts.fromAddress,
    to: opts.toAddress,
    amount: opts.amountMlcns,
  };
}
