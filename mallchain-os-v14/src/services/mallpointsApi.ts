/**
 * Mallpoints API service — wraps the backend's x/mallpoints-backed endpoints.
 * Maps to: GET /api/mallpoints/{address}, POST /api/mallpoints/convert
 */
import { api } from './api';
import { type ApiResult } from './api';

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
  credit: unknown;
}

class MallpointsApi {
  async getBalance(address: string): Promise<ApiResult<MallpointsBalance>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    return api.get<MallpointsBalance>(`/api/mallpoints/${address}`);
  }

  async convert(address: string): Promise<ApiResult<ConvertResult>> {
    if (!address) return { ok: false, error: 'Wallet address is required' };
    return api.post<ConvertResult>('/api/mallpoints/convert', { address });
  }
}

export const mallpointsApi = new MallpointsApi();
