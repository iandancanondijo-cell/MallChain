/** Real referrals API — wraps backend/src/routes/referrals.js. */
import { api } from './api';
import { type ApiResult } from './api';

/**
 * `code` is null until the account has connected a wallet: the backend mints
 * the code at link time (authController.activateReferralCode), because that is
 * the moment the account becomes rewardable. It used to answer a plausible
 * `MALL-…` string for every account — a code that was never stored, so people
 * referred with it credited nobody. `walletConnected` is why the box is empty,
 * and is what the page branches on.
 */
export interface ReferralStats {
  code: string | null;
  walletConnected?: boolean;
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
