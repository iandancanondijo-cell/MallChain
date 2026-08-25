/**
 * Client-side signing + broadcast for x/vault's MsgSetupVault/MsgConfirmVault/
 * MsgDisableVault. Mirrors stakingDelegateTx.ts's pattern: sign locally with
 * the account's own key (this authorizes the Msg — see msg_signer.go), then
 * hand the signed bytes to the backend's broadcast relay. Nothing in this
 * file ever touches the vault's own password or TOTP secret — those are
 * consumed entirely by vaultCrypto.ts before a Msg value is built.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { api } from './api';
import { chain } from './config';
import {
  createVaultRegistry,
  MSG_SETUP_VAULT,
  MSG_CONFIRM_VAULT,
  MSG_DISABLE_VAULT,
  type MsgSetupVaultValue,
  type MsgConfirmVaultValue,
  type MsgDisableVaultValue,
} from './vaultProto';

const DEFAULT_GAS_LIMIT = 200000;

export class VaultTxError extends Error {}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new VaultTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new VaultTxError('This account has no on-chain history yet.');
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

async function signAndBroadcast(opts: { mnemonic: string; fromAddress: string; typeUrl: string; value: unknown }): Promise<{ txHash: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new VaultTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createVaultRegistry();
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

  const res = await api.post<{ success: boolean; txHash: string; error?: string }>('/api/key-vault/broadcast', {
    txBytes: toBase64(txRawBytes),
  });
  if (!res.ok || !res.data?.txHash) {
    throw new VaultTxError(res.error || res.data?.error || 'Transaction failed during broadcast');
  }
  return { txHash: res.data.txHash };
}

export async function setupVault(opts: { mnemonic: string; fromAddress: string } & Omit<MsgSetupVaultValue, 'authority'>): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_SETUP_VAULT,
    value: {
      authority: opts.fromAddress,
      salt: opts.salt,
      kdfTime: opts.kdfTime,
      kdfMemory: opts.kdfMemory,
      kdfThreads: opts.kdfThreads,
      kdfKeyLen: opts.kdfKeyLen,
      nonceTotp: opts.nonceTotp,
      encryptedTotpSecret: opts.encryptedTotpSecret,
    },
  });
}

export async function confirmVault(opts: { mnemonic: string; fromAddress: string } & Omit<MsgConfirmVaultValue, 'authority'>): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_CONFIRM_VAULT,
    value: {
      authority: opts.fromAddress,
      noncePriv: opts.noncePriv,
      ciphertext: opts.ciphertext,
      publicKey: opts.publicKey,
    },
  });
}

export async function disableVault(opts: { mnemonic: string; fromAddress: string } & Omit<MsgDisableVaultValue, 'authority'>): Promise<{ txHash: string }> {
  return signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.fromAddress,
    typeUrl: MSG_DISABLE_VAULT,
    value: { authority: opts.fromAddress },
  });
}
