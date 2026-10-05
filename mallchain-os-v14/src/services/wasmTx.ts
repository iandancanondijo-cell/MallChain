/**
 * Client-side signing + broadcast for x/wasm transactions (store code,
 * instantiate, execute). Same offline-signing pattern as marketplaceTx.ts:
 * build and sign the tx fully offline using account_number/sequence fetched
 * from the backend, then hand the signed txBytes to the backend's broadcast
 * relay at /api/contracts/broadcast.
 */
import { DirectSecp256k1HdWallet, Registry, encodePubkey, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { defaultRegistryTypes, calculateFee, GasPrice } from '@cosmjs/stargate';
import { toBase64, fromBase64 } from '@cosmjs/encoding';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import {
  MsgStoreCode,
  MsgInstantiateContract,
  MsgExecuteContract,
} from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { api } from './api';
import { chain } from './config';
import { estimateGas } from './gasEstimation';
import { broadcastWithRetry } from './broadcastWithRetry';
import { waitForConfirmation } from './txConfirmation';

export const MSG_STORE_CODE = '/cosmwasm.wasm.v1.MsgStoreCode';
export const MSG_INSTANTIATE_CONTRACT = '/cosmwasm.wasm.v1.MsgInstantiateContract';
export const MSG_EXECUTE_CONTRACT = '/cosmwasm.wasm.v1.MsgExecuteContract';

const PLACEHOLDER_GAS_LIMIT = 0;

export class WasmTxError extends Error {
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
    throw new WasmTxError(res.error || 'Failed to fetch account info from the chain');
  }
  if (res.data.notFound) {
    throw new WasmTxError(
      'This account has no on-chain history yet — it needs a small stake balance for gas first.',
      'NO_ON_CHAIN_HISTORY'
    );
  }
  return { accountNumber: res.data.accountNumber, sequence: res.data.sequence };
}

function createWasmRegistry(): Registry {
  return new Registry([
    ...defaultRegistryTypes,
    [MSG_STORE_CODE, MsgStoreCode as unknown as import('@cosmjs/proto-signing').GeneratedType],
    [MSG_INSTANTIATE_CONTRACT, MsgInstantiateContract as unknown as import('@cosmjs/proto-signing').GeneratedType],
    [MSG_EXECUTE_CONTRACT, MsgExecuteContract as unknown as import('@cosmjs/proto-signing').GeneratedType],
  ]);
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
    throw new WasmTxError('The stored recovery phrase does not match this wallet\'s address.');
  }

  const { accountNumber, sequence } = await fetchAccountInfo(opts.fromAddress);

  const registry = createWasmRegistry();
  const bodyBytes = registry.encodeTxBody({
    messages: [{ typeUrl: opts.typeUrl, value: opts.value }],
    memo: '',
  });

  const pubkey = encodePubkey({ type: 'tendermint/PubKeySecp256k1', value: toBase64(account.pubkey) });

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

  const gasLimit = await estimateGas(toBase64(placeholderTxRaw));

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

  try {
    const data = await broadcastWithRetry('/api/contracts/broadcast', { txBytes });
    return data.txHash;
  } catch (err) {
    throw new WasmTxError(err instanceof Error ? err.message : 'Wasm transaction failed during broadcast');
  }
}

function decodeEventAttr(value: string): string {
  try {
    const decoded = atob(value);
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0e-\x1f]/.test(decoded)) return value;
    return decoded;
  } catch {
    return value;
  }
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

export interface StoreCodeResult {
  txHash: string;
  codeId: string;
}

/** Uploads wasm bytecode to the chain. Returns the txHash and codeId. */
export async function storeCode(opts: {
  mnemonic: string;
  sender: string;
  wasmByteCode: Uint8Array;
}): Promise<StoreCodeResult> {
  const value = MsgStoreCode.fromPartial({
    sender: opts.sender,
    wasmByteCode: opts.wasmByteCode,
  });
  const txHash = await signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.sender,
    typeUrl: MSG_STORE_CODE,
    value,
  });
  const confirmation = await waitForConfirmation(txHash);
  const events = confirmation.events || [];
  const codeId = findEventAttr(events, 'store_code', 'code_id');
  if (!codeId) {
    throw new WasmTxError('Code was stored but its codeId could not be read back from the chain.');
  }
  return { txHash, codeId };
}

export interface InstantiateResult {
  txHash: string;
  address: string;
}

/** Creates a new contract instance from a stored codeId. */
export async function instantiateContract(opts: {
  mnemonic: string;
  sender: string;
  codeId: string;
  label: string;
  initMsg: Record<string, unknown>;
  funds?: Array<{ denom: string; amount: string }>;
  admin?: string;
}): Promise<InstantiateResult> {
  const value = MsgInstantiateContract.fromPartial({
    sender: opts.sender,
    admin: opts.admin || '',
    codeId: BigInt(opts.codeId),
    label: opts.label,
    msg: new TextEncoder().encode(JSON.stringify(opts.initMsg)),
    funds: (opts.funds || []).map((f) => ({ denom: f.denom, amount: f.amount })),
  });
  const txHash = await signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.sender,
    typeUrl: MSG_INSTANTIATE_CONTRACT,
    value,
  });
  const confirmation = await waitForConfirmation(txHash);
  const events = confirmation.events || [];
  const address = findEventAttr(events, 'instantiate', '_contract_address')
    || findEventAttr(events, 'wasm', '_contract_address');
  if (!address) {
    throw new WasmTxError('Contract was instantiated but its address could not be read back from the chain.');
  }
  return { txHash, address };
}

/** Executes a method on an existing contract instance. */
export async function executeContract(opts: {
  mnemonic: string;
  sender: string;
  contractAddress: string;
  executeMsg: Record<string, unknown>;
  funds?: Array<{ denom: string; amount: string }>;
}): Promise<{ txHash: string }> {
  const value = MsgExecuteContract.fromPartial({
    sender: opts.sender,
    contract: opts.contractAddress,
    msg: new TextEncoder().encode(JSON.stringify(opts.executeMsg)),
    funds: (opts.funds || []).map((f) => ({ denom: f.denom, amount: f.amount })),
  });
  const txHash = await signAndBroadcast({
    mnemonic: opts.mnemonic,
    fromAddress: opts.sender,
    typeUrl: MSG_EXECUTE_CONTRACT,
    value,
  });
  await waitForConfirmation(txHash);
  return { txHash };
}

/** Full deploy flow: store code + instantiate in two sequential transactions. */
export async function deployContract(opts: {
  mnemonic: string;
  sender: string;
  wasmByteCode: Uint8Array;
  label: string;
  initMsg: Record<string, unknown>;
  funds?: Array<{ denom: string; amount: string }>;
}): Promise<{ storeTxHash: string; codeId: string; instantiateTxHash: string; address: string }> {
  const storeResult = await storeCode({
    mnemonic: opts.mnemonic,
    sender: opts.sender,
    wasmByteCode: opts.wasmByteCode,
  });

  const instantiateResult = await instantiateContract({
    mnemonic: opts.mnemonic,
    sender: opts.sender,
    codeId: storeResult.codeId,
    label: opts.label,
    initMsg: opts.initMsg,
    funds: opts.funds,
  });

  return {
    storeTxHash: storeResult.txHash,
    codeId: storeResult.codeId,
    instantiateTxHash: instantiateResult.txHash,
    address: instantiateResult.address,
  };
}
