/**
 * Client-side signing + broadcast for a real Cosmos SDK x/staking
 * MsgCreateValidator self-bond.
 *
 * This platform holds no custodial keys for regular users (mnemonics live
 * only in the browser's local store — see WalletSend.tsx/governanceTx.ts),
 * so an admin approving a validator application cannot broadcast this on
 * the applicant's behalf. Approval instead unlocks this action, which the
 * applicant runs themselves from their own wallet: delegator_address and
 * validator_address both resolve to the applicant's own account (a real
 * Cosmos self-bond always uses the same underlying key for both — they
 * only differ in bech32 prefix, "mall1…" vs "mallvaloper1…").
 *
 * The consensus (ed25519) keypair is generated fresh in the browser and
 * never leaves it — there is no live CometBFT node process anywhere for
 * this identity, so the resulting validator will not produce blocks and
 * will show as jailed for downtime shortly after creation. That's an
 * honest reflection of running a single-node devnet, not a bug; the UI
 * discloses it and offers the generated key for download in case the
 * applicant later wants to run a real node under this same identity.
 */
import { DirectSecp256k1HdWallet, encodePubkey, makeAuthInfoBytes, makeSignDoc, Registry } from '@cosmjs/proto-signing';
import { calculateFee, GasPrice, defaultRegistryTypes } from '@cosmjs/stargate';
import { toBase64, fromBase64, toBech32, fromBech32 } from '@cosmjs/encoding';
import { Random, Ed25519 } from '@cosmjs/crypto';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { MsgCreateValidator } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import { PubKey as Ed25519PubKeyProto } from 'cosmjs-types/cosmos/crypto/ed25519/keys';
import { api } from './api';
import { chain } from './config';

const DEFAULT_GAS_LIMIT = 300000;
const VALOPER_SUFFIX = 'valoper';

export class ValidatorCreateTxError extends Error {}

export interface GeneratedConsensusKey {
  pubkeyBase64: string;
  privkeyBase64: string;
}

/** Generates a fresh ed25519 consensus keypair client-side (never sent to the backend). */
export async function generateConsensusKeypair(): Promise<GeneratedConsensusKey> {
  const seed = Random.getBytes(32);
  const keypair = await Ed25519.makeKeypair(seed);
  return {
    pubkeyBase64: toBase64(keypair.pubkey),
    privkeyBase64: toBase64(keypair.privkey),
  };
}

/** Derives the "…valoper1…" operator address from a regular "mall1…" account address — same key, different bech32 prefix. */
export function toValoperAddress(accountAddress: string): string {
  const { data } = fromBech32(accountAddress, undefined);
  return toBech32(chain.addressPrefix + VALOPER_SUFFIX, data);
}

async function fetchAccountInfo(address: string): Promise<{ accountNumber: number; sequence: number }> {
  const res = await api.get<{ success: boolean; accountNumber: number; sequence: number; notFound?: boolean }>(
    `/api/send/account/${address}`
  );
  if (!res.ok || !res.data) throw new ValidatorCreateTxError(res.error || 'Failed to fetch account info from the chain');
  if (res.data.notFound) throw new ValidatorCreateTxError('This account has no on-chain history yet.');
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

/** Signs and broadcasts a real self-bond MsgCreateValidator. */
export async function createValidatorSelfBond(opts: {
  mnemonic: string;
  fromAddress: string;
  moniker: string;
  website: string;
  details: string;
  selfDelegationAmount: string; // base denom units
  denom: string;
  consensusPubkeyBase64: string;
}): Promise<{ txHash: string; validatorAddress: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(opts.mnemonic, { prefix: chain.addressPrefix });
  const [account] = await wallet.getAccounts();
  if (account.address !== opts.fromAddress) {
    throw new ValidatorCreateTxError("The stored recovery phrase does not match this wallet's address.");
  }

  const validatorAddress = toValoperAddress(opts.fromAddress);
  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = new Registry(defaultRegistryTypes);
  const msg = {
    typeUrl: '/cosmos.staking.v1beta1.MsgCreateValidator',
    value: MsgCreateValidator.fromPartial({
      description: { moniker: opts.moniker, identity: '', website: opts.website, securityContact: '', details: opts.details },
      // Dec fields are encoded on the wire as a raw 18-decimal fixed-point
      // big.Int string (no literal decimal point) — "0.1" as JSON/amino
      // (e.g. in a gentx file) is NOT the same representation the
      // protobuf-level big.Int unmarshaler here expects.
      commission: { rate: '100000000000000000', maxRate: '200000000000000000', maxChangeRate: '10000000000000000' },
      minSelfDelegation: '1',
      delegatorAddress: opts.fromAddress,
      validatorAddress,
      pubkey: {
        typeUrl: Ed25519PubKeyProto.typeUrl,
        value: Ed25519PubKeyProto.encode({ key: fromBase64(opts.consensusPubkeyBase64) }).finish(),
      },
      value: { denom: opts.denom, amount: opts.selfDelegationAmount },
    }),
  };

  const bodyBytes = registry.encodeTxBody({ messages: [msg], memo: '' });
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
    throw new ValidatorCreateTxError(res.error || res.data?.error || 'Transaction failed during broadcast');
  }
  return { txHash: res.data.txHash, validatorAddress };
}
