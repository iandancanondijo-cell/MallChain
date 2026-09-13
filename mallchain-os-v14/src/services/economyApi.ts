/**
 * Economy / tokenomics API — wraps GET /api/economy/state
 * (backend/src/routes/economy.js), which bundles the emission schedule,
 * supply/burn stats, MLCNS market price, Mallpoints conversion window, and
 * treasury wallet balances in one real (not fabricated) response.
 */
import { api } from './api';

export interface EconomyMarket {
  buyPriceKes: number;
  sellPriceKes: number;
  midPriceKes: number;
}

export interface EconomyEmission {
  currentMonth: number;
  phase: number;
  monthlyCap: number;
  dailyLimit: number;
  totalAvailable: number;
  totalSupply: number;
  emittedTotal: string;
  burnedTotal: string;
  burnRatePercent: string;
  remainingInSchedule: number;
  monthsRemaining: number;
}

export interface EconomyPhase {
  phase: number;
  months: string;
  monthly: string;
  cumulative: string;
}

export interface EconomyConversion {
  badgeHolders: string;
  nonBadge: string;
  rate: string;
  valueRatio: string;
}

export interface EconomyUser {
  address: string;
  mlcns: number;
  mallpoints: number;
  mlcnsPriceKes: number;
  totalKesValue: number;
  valueRatio: string;
}

export interface EconomyState {
  mlcnsPriceKes: number;
  market: EconomyMarket;
  pointPriceKes: number;
  emission: EconomyEmission;
  schedule: { phaseMonths: number; phases: EconomyPhase[] };
  conversion: EconomyConversion;
  wallets: Record<string, number | null> | null;
  user: EconomyUser | null;
  timestamp: string;
}

export interface EconomyUserHoldings {
  address: string;
  mlcns: number;
  mallpoints: number;
  mlcnsPriceKes: number;
  estimatedKesValue: number;
  valueRatio: string;
}

export const economyApi = {
  async getState() {
    return api.get<EconomyState>('/api/economy/state');
  },
  /**
   * GET /api/economy/user/:address — personalized holdings keyed by the
   * wallet address the client already knows (st.wallet.address), rather
   * than /state's own user block, which only resolves a wallet by decoding
   * it out of the session JWT — so it stays null for anyone who connected a
   * wallet locally without that same address also being on their account.
   */
  async getUserHoldings(address: string) {
    return api.get<EconomyUserHoldings>(`/api/economy/user/${address}`);
  },
};
