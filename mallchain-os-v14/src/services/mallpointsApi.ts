/**
 * Mallpoints API service — wraps the backend's x/mallpoints-backed endpoints.
 * Maps to: GET /api/mallpoints/{address}, POST /api/mallpoints/convert
 */
import { Secp256k1HdWallet, makeSignDoc } from '@cosmjs/amino';
import { toBase64, toUtf8 } from '@cosmjs/encoding';
import { api } from './api';
import { type ApiResult } from './api';
import { chain } from './config';

export interface ConversionStatus {
  canConvert: boolean;
  reason: string | null;
  nextAllowedConversionAt: string | null;
  windowRule: string;
  allowAnyDay: boolean;
}

export interface MallpointsBalance {
  address: string;
  balance: number;
  chainPoints: number;
  dbPoints: number;
  sources: { chain: number | null; database: number };
  lastConversionAt?: string | null;
  pointPrice: number;
  conversionWindow: unknown;
  badge: { exists: boolean; [key: string]: unknown };
  conversionStatus: ConversionStatus;
  convertiblePoints: number;
}

export interface ConvertResult {
  ok: boolean;
  convertedPoints: number;
  mallcoins: number;
  mlcoinPrice?: number;
  liquidity?: unknown;
  credit: unknown;
}

/** Must match backend/src/mallwallet/security/verifyAdr036.js's convertMessage() exactly. */
function convertMessage(address: string, timestamp: string): string {
  return `Convert Mallpoints to Mallcoin for ${address} at ${timestamp}`;
}

class MallpointsApi {
  async getBalance(address: string): Promise<ApiResult<MallpointsBalance>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    return api.get<MallpointsBalance>(`/api/mallpoints/${address}`);
  }

  /**
   * `mnemonic` proves control of `address` via an ADR-036 off-chain
   * signature (nothing is broadcast on-chain) — the backend requires this
   * because /convert triggers a real operator-signed MLCNS credit +
   * liquidity-add on the caller's behalf; see the route for why a bare
   * address alone isn't enough.
   */
  async convert(address: string, mnemonic: string): Promise<ApiResult<ConvertResult>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    if (!mnemonic) return { ok: false, error: 'Wallet is locked — unlock it to sign this request' };

    const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: chain.addressPrefix });
    const timestamp = new Date().toISOString();
    const msg = {
      type: 'sign/MsgSignData',
      value: { signer: address, data: toBase64(toUtf8(convertMessage(address, timestamp))) },
    };
    const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
    const { signature } = await wallet.signAmino(address, signDoc);

    return api.post<ConvertResult>('/api/mallpoints/convert', {
      address,
      timestamp,
      pubKey: signature.pub_key.value,
      signature: signature.signature,
    });
  }
}

export const mallpointsApi = new MallpointsApi();
