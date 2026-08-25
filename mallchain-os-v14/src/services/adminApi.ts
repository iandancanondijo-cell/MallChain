/**
 * Admin API service — wraps the backend's /api/admin/* panel (see
 * backend/src/routes/adminPanel.js) plus the admin-gated campaign-creation
 * endpoints on /api/mines/*. Every method here requires the logged-in user
 * to have role 'admin' or 'superadmin' (see middleware/adminAuth.js);
 * superadmin-only actions are called out per-method.
 */
import { api } from './api';
import { type ApiResult } from './api';

export interface CurrentUser {
  _id: string;
  id: string;
  email: string;
  username: string | null;
  role: 'user' | 'admin' | 'superadmin';
  banned?: boolean;
}

export interface AdminDashboardStats {
  users: { total: number; admins: number; banned: number };
  validators: { pending: number; active: number };
  mining: { pendingSubmissions: number; totalCampaigns: number };
  recentUsers: Array<{ _id: string; email: string; role: string; createdAt: string; banned: boolean }>;
}

export interface AdminUser {
  _id: string;
  email: string;
  username: string | null;
  role: 'user' | 'admin' | 'superadmin';
  banned: boolean;
  banReason?: string;
  mlpts_balance: number;
  mallcoin_balance: number;
  createdAt: string;
}

export interface AdminValidatorApplication {
  _id: string;
  applicantAddress: string;
  validatorAddress: string;
  moniker: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewNotes?: string;
}

export interface AdminKycSubmission {
  _id: string;
  userId: { _id: string; email: string; username: string | null } | string;
  firstName: string;
  lastName: string;
  idType: 'passport' | 'drivers_license' | 'national_id';
  idNumber: string;
  idDocumentUrl?: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'review';
  submittedAt: string;
}

export interface AdminCampaign {
  _id: string;
  creator_id: string;
  title: string;
  description?: string;
  rate_per_task: number;
  budget_remaining: number;
  status: 'active' | 'paused' | 'completed';
  completions_count: number;
}

export interface AdminSubmission {
  _id: string;
  miner_id: string;
  title?: string;
  description?: string;
  proof_url?: string;
  campaign_id?: string;
  status: string;
  created_at: string;
}

export interface AdminBadgePurchase {
  _id: string;
  quoteId: string;
  walletAddress: string;
  phone: string;
  fiatAmount: number;
  currency: string;
  status: 'pending' | 'payment_initiated' | 'confirmed' | 'processing' | 'issued' | 'failed';
  mpesaRef?: string;
  badgeTxHash?: string;
  reason?: string;
  createdAt: string;
}

export interface AdminBadgeIssuance {
  _id: string;
  userId?: string;
  walletAddress: string;
  method: 'streak' | 'purchase' | 'admin_manual';
  badgeType: string;
  txHash?: string;
  issuedAt: string;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  actor: string;
  details: unknown;
  outcome: string;
  createdAt: string;
}

export interface LiquidityActivityItem {
  _id: string;
  flow: 'buy' | 'withdraw' | 'reconciliation' | 'mallpoints_convert';
  stage: string;
  status: 'pending' | 'success' | 'failed' | 'info';
  poolId?: number;
  quoteId?: string;
  paymentId?: string;
  withdrawalId?: string;
  saleId?: string;
  payoutRef?: string;
  walletAddress?: string;
  phone?: string;
  currency?: string;
  amountMlcns?: number;
  fiatAmount?: number;
  lpTokens?: number;
  creditTxHash?: string;
  liquidityTxHash?: string;
  sellTxHash?: string;
  createdAt: string;
}

export interface ReconciliationItem {
  _id: string;
  purchaseId: string;
  quoteId?: string;
  creditTxHash: string;
  walletAddress: string;
  mlcnsAmount: number;
  fiatAmount: number;
  reason?: string;
  status: 'detected' | 'compensating' | 'pending_manual' | 'resolved';
  compensationTx?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminWithdrawalRequest {
  _id: string;
  withdrawalId: string;
  walletAddress: string;
  phone: string;
  amountMlcns: number;
  amountKes: number;
  currency?: string;
  status: 'pending_review' | 'payout_initiated' | 'completed' | 'failed';
  payoutProvider?: string;
  payoutRef?: string;
  settlementMode?: 'review' | 'signed_sell';
  saleId?: string;
  sellTxHash?: string;
  burnTxHash?: string;
  notes?: string;
  createdAt: string;
}

export interface BurnPolicyEntry {
  _id: string;
  activity: 'marketplace_purchase' | 'wallet_transfer' | 'cash_out' | 'validator_penalty' | 'lost_recovery';
  burnPercentage: number;
  description?: string;
  enabled: boolean;
}

export interface DynamicBurnThresholdEntry {
  _id: string;
  activity: 'cash_out' | 'marketplace_purchase' | 'wallet_transfer';
  supplyThreshold: number;
  burnPercentage: number;
  order: number;
  enabled: boolean;
}

export interface TreasuryLedgerEntry {
  _id: string;
  txHash?: string;
  activity: 'inflow_cash_out' | 'outflow_reward' | 'outflow_payout' | 'burn' | 'reconciliation';
  amount: number;
  direction: 'inflow' | 'outflow' | 'burn';
  relatedSaleId?: string;
  relatedQuoteId?: string;
  description?: string;
  balance?: number;
  createdAt: string;
}

export interface TreasuryMetricTotal {
  activity: string;
  direction: string;
  totalAmount: number;
  count: number;
}

class AdminApi {
  async getMe(): Promise<ApiResult<{ user: CurrentUser }>> {
    return api.get('/api/auth/me');
  }

  async getDashboard(): Promise<ApiResult<{ stats: AdminDashboardStats }>> {
    return api.get('/api/admin/dashboard');
  }

  async listUsers(params?: { search?: string; role?: string; banned?: boolean; page?: number }): Promise<ApiResult<{ users: AdminUser[]; total: number }>> {
    const query: Record<string, string | number> = {};
    if (params?.search) query.search = params.search;
    if (params?.role) query.role = params.role;
    if (params?.banned !== undefined) query.banned = String(params.banned);
    if (params?.page) query.page = params.page;
    return api.get('/api/admin/users', query);
  }

  /** Superadmin only. */
  async setUserRole(userId: string, role: 'user' | 'admin' | 'superadmin'): Promise<ApiResult<{ user: AdminUser }>> {
    return api.put(`/api/admin/users/${encodeURIComponent(userId)}/role`, { role });
  }

  async banUser(userId: string, banned: boolean, reason?: string): Promise<ApiResult<{ user: AdminUser }>> {
    return api.put(`/api/admin/users/${encodeURIComponent(userId)}/ban`, { banned, reason });
  }

  /** Superadmin only. */
  async deleteUser(userId: string): Promise<ApiResult<{ user: AdminUser }>> {
    return api.del(`/api/admin/users/${encodeURIComponent(userId)}`);
  }

  async listValidatorApplications(status?: string): Promise<ApiResult<{ applications: AdminValidatorApplication[]; total: number }>> {
    return api.get('/api/admin/validators/applications', status ? { status } : undefined);
  }

  async reviewValidatorApplication(id: string, action: 'approved' | 'rejected', notes?: string): Promise<ApiResult<{ application: AdminValidatorApplication }>> {
    return api.post(`/api/admin/validators/applications/${encodeURIComponent(id)}/review`, { action, notes });
  }

  async listPendingKyc(): Promise<ApiResult<{ submissions: AdminKycSubmission[]; total: number }>> {
    return api.get('/api/admin/kyc/pending');
  }

  async reviewKyc(id: string, action: 'approved' | 'rejected', notes?: string): Promise<ApiResult<{ kyc: AdminKycSubmission }>> {
    return api.post(`/api/admin/kyc/${encodeURIComponent(id)}/review`, { action, notes });
  }

  async listMiningCampaigns(status?: string): Promise<ApiResult<{ campaigns: AdminCampaign[]; total: number }>> {
    return api.get('/api/admin/mining/campaigns', status ? { status } : undefined);
  }

  async listPendingSubmissions(): Promise<ApiResult<{ submissions: AdminSubmission[]; total: number }>> {
    return api.get('/api/admin/mining/submissions/pending');
  }

  async approveSubmission(id: string, rewardAmount?: number): Promise<ApiResult<{ submission: AdminSubmission }>> {
    return api.post(`/api/admin/mining/submissions/${encodeURIComponent(id)}/approve`, rewardAmount ? { rewardAmount } : {});
  }

  async rejectSubmission(id: string, note?: string): Promise<ApiResult<{ submission: AdminSubmission }>> {
    return api.post(`/api/admin/mining/submissions/${encodeURIComponent(id)}/reject`, { note });
  }

  /** Campaign creation lives on /api/mines (requireAdmin-gated), not /api/admin. */
  async createCampaign(payload: { creator_id: string; title: string; description?: string; rate_per_task: number; budget_remaining: number }): Promise<ApiResult<AdminCampaign>> {
    return api.post('/api/mines/campaigns', payload);
  }

  async getAuditLog(limit = 50): Promise<ApiResult<{ logs: AuditLogEntry[] }>> {
    return api.get('/api/admin/audit', { limit });
  }

  async listBadgePurchases(status?: string): Promise<ApiResult<{ purchases: AdminBadgePurchase[]; total: number }>> {
    return api.get('/api/admin/badges/purchases', status ? { status } : undefined);
  }

  async listBadgeIssuances(method?: string): Promise<ApiResult<{ issuances: AdminBadgeIssuance[]; total: number }>> {
    return api.get('/api/admin/badges/issuances', method ? { method } : undefined);
  }

  async grantBadge(walletAddress: string): Promise<ApiResult<{ txHash: string }>> {
    return api.post('/api/admin/badges/grant', { walletAddress });
  }

  async voidBadgePurchase(quoteId: string, reason?: string): Promise<ApiResult<{ purchase: AdminBadgePurchase }>> {
    return api.post(`/api/admin/badges/purchases/${encodeURIComponent(quoteId)}/void`, { reason });
  }

  async listLiquidityActivity(params?: { flow?: string; limit?: number }): Promise<ApiResult<{ items: LiquidityActivityItem[]; total: number }>> {
    const query: Record<string, string | number> = {};
    if (params?.flow) query.flow = params.flow;
    if (params?.limit) query.limit = params.limit;
    return api.get('/api/liquidity/activity', query);
  }

  async listReconciliationItems(status?: string): Promise<ApiResult<{ items: ReconciliationItem[]; total: number }>> {
    return api.get('/api/admin/reconciliation/items', status ? { status } : undefined);
  }

  async runReconciliation(): Promise<ApiResult<{ result: unknown }>> {
    return api.post('/api/admin/reconciliation/run', {});
  }

  async listWithdrawals(status?: string): Promise<ApiResult<{ withdrawals: AdminWithdrawalRequest[]; total: number }>> {
    return api.get('/api/admin/withdrawals', status ? { status } : undefined);
  }

  async listBurnPolicies(): Promise<ApiResult<{ policies: BurnPolicyEntry[] }>> {
    return api.get('/api/admin/treasury/policies');
  }

  async saveBurnPolicy(payload: { activity: string; burnPercentage: number; description?: string; enabled?: boolean }): Promise<ApiResult<{ policy: BurnPolicyEntry }>> {
    return api.post('/api/admin/treasury/policies', payload);
  }

  async deleteBurnPolicy(activity: string): Promise<ApiResult<{ deleted: boolean }>> {
    return api.del(`/api/admin/treasury/policies/${encodeURIComponent(activity)}`);
  }

  async listDynamicThresholds(): Promise<ApiResult<{ thresholds: DynamicBurnThresholdEntry[] }>> {
    return api.get('/api/admin/treasury/dynamic-thresholds');
  }

  async saveDynamicThreshold(payload: { activity: string; supplyThreshold: number; burnPercentage: number; order?: number; enabled?: boolean }): Promise<ApiResult<{ threshold: DynamicBurnThresholdEntry }>> {
    return api.post('/api/admin/treasury/dynamic-thresholds', payload);
  }

  async deleteDynamicThreshold(id: string): Promise<ApiResult<{ deleted: boolean }>> {
    return api.del(`/api/admin/treasury/dynamic-thresholds/${encodeURIComponent(id)}`);
  }

  async getTreasuryLedger(params?: { activity?: string; direction?: string; limit?: number }): Promise<ApiResult<{ entries: TreasuryLedgerEntry[] }>> {
    const query: Record<string, string | number> = {};
    if (params?.activity) query.activity = params.activity;
    if (params?.direction) query.direction = params.direction;
    if (params?.limit) query.limit = params.limit;
    return api.get('/api/admin/treasury/ledger', query);
  }

  async getTreasuryMetrics(): Promise<ApiResult<{ totals: TreasuryMetricTotal[] }>> {
    return api.get('/api/admin/treasury/metrics');
  }
}

export const adminApi = new AdminApi();
