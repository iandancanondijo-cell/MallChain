/** Wraps the backend's faucet endpoints (backend/src/routes/faucet.js) — real, working, rate-limited. */
import { api, type ApiResult } from './api';

export interface FundGasResponse {
  success: boolean;
  funded: boolean;
  amount: string;
  denom: string;
}

export const faucetApi = {
  fundGas(address: string): Promise<ApiResult<FundGasResponse>> {
    return api.post('/api/faucet/fund-gas', { address });
  },
};
