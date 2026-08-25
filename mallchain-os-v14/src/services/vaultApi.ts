/**
 * Read-only access to x/vault's stored blob, via the backend's REST-gateway
 * proxy (routes/keyVault.js -> GET /marketplace/vault/v1/blob/{owner}).
 * Cosmos REST responses use snake_case JSON keys matching the .proto field
 * names — this normalizes that into a camelCase shape for the rest of the
 * app, the same way other chain-facing services here do.
 */
import { api } from './api';

interface RawVaultBlobResponse {
  found: boolean;
  salt: string;
  kdf_time: number;
  kdf_memory: number;
  kdf_threads: number;
  kdf_key_len: number;
  nonce_totp: string;
  encrypted_totp_secret: string;
  nonce_priv: string;
  ciphertext: string;
  public_key: string;
}

export interface VaultBlobInfo {
  found: boolean;
  salt: string;
  kdfTime: number;
  kdfMemory: number;
  kdfThreads: number;
  kdfKeyLen: number;
  nonceTotp: string;
  encryptedTotpSecret: string;
  noncePriv: string;
  ciphertext: string;
  publicKey: string;
}

export async function getVaultBlob(owner: string): Promise<VaultBlobInfo> {
  const res = await api.get<{ success: boolean; blob: RawVaultBlobResponse }>(`/api/key-vault/blob/${owner}`);
  if (!res.ok || !res.data) {
    throw new Error(res.error || 'Failed to fetch vault status');
  }
  const b = res.data.blob;
  return {
    found: !!b.found,
    salt: b.salt || '',
    kdfTime: Number(b.kdf_time) || 0,
    kdfMemory: Number(b.kdf_memory) || 0,
    kdfThreads: Number(b.kdf_threads) || 0,
    kdfKeyLen: Number(b.kdf_key_len) || 0,
    nonceTotp: b.nonce_totp || '',
    encryptedTotpSecret: b.encrypted_totp_secret || '',
    noncePriv: b.nonce_priv || '',
    ciphertext: b.ciphertext || '',
    publicKey: b.public_key || '',
  };
}
