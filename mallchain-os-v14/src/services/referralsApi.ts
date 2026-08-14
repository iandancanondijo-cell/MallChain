/** Real referrals API — wraps backend/src/routes/referrals.js. */
import { api } from './api';
import { type ApiResult } from './api';

export interface ReferralStats {
  code: string;
  earned: number;
  count: number;
  claimed: number;
}

export interface ClaimResult {
  success: boolean;
  claimed: number;
  message: string;
}

class ReferralsApi {
  async get(): Promise<ApiResult<ReferralStats>> {
    return api.get('/api/referrals');
  }

  async claim(): Promise<ApiResult<ClaimResult>> {
    return api.post('/api/referrals/claim', {});
  }
}

export const referralsApi = new ReferralsApi();
