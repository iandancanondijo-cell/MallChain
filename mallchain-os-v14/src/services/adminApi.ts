/**
 * Admin API service — wraps the backend's /api/admin/* panel (see
 * backend/src/routes/adminPanel.js) plus the admin-gated campaign-creation
 * endpoints on /api/mines/*. Every method here requires the logged-in user
 * to have role 'admin' or 'superadmin' (see middleware/adminAuth.js);
 * superadmin-only actions are called out per-method.
 */
import { api } from './api';
import { type ApiResult } from './api';
import { config } from './config';

export interface CurrentUser {
  _id: string;
  id: string;
  email: string;
  username: string | null;
  role: 'user' | 'admin' | 'superadmin';
  banned?: boolean;
  // Present for role==='admin'. null/undefined for superadmin (sees all)
  // and for non-admins. Used by AdminApp to land the user in the correct
  // category window and gate the Reports UI on its own category.
  adminCategory?: 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports' | null;
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
  adminCategory?: string | null;
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

/** A decided KYC record from GET /api/admin/kyc/reviewed. */
export interface AdminReviewedKyc extends AdminKycSubmission {
  reviewedAt?: string;
  reviewedBy?: { _id: string; email: string; username: string | null } | string | null;
  reviewedScreenshotRef?: string;
  notes?: string;
}

/** A decided AML review from GET /api/admin/aml-reviews/reviewed. */
export interface AdminReviewedAml extends AdminAmlReview {
  reviewedBy?: { _id: string; email: string; username: string | null } | string | null;
}

/** Identity bundle returned by GET /api/admin/kyc/user/:userId. */
export interface AdminKycUserDetail {
  user: { _id: string; email: string | null; username: string | null; role: string; kycLevel: number; banned: boolean; createdAt: string };
  kyc: { total: number; latest: { status: string; submittedAt: string; reviewedAt?: string; riskLevel: string; idType: string } | null; history: Array<{ status: string; submittedAt: string; reviewedAt?: string; riskLevel: string; idType: string }> };
  aml: { total: number; pending: number };
}

export interface GovernanceStats {
  total: number;
  voting: number;
  passed: number;
  rejected: number;
}

export interface AdminAmlReview {
  _id: string;
  userId: { _id: string; email: string; username: string | null } | string;
  walletAddress: string;
  triggerAmountKes: number;
  fundsSource: 'mining_staking_rewards' | 'mallpoints_conversion' | 'referral_bonus' | 'salary' | 'business_income' | 'gift' | 'asset_sale' | 'other';
  isNativeEarnings: boolean;
  narrative: string;
  documentRef: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface AdminStructuringFlag {
  _id: string;
  walletAddress: string;
  windowStartAt: string;
  windowEndAt: string;
  cumulativeKes: number;
  relatedWithdrawalIds: string[];
  acknowledged: boolean;
  acknowledgedAt?: string;
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
  status: 'pending' | 'payment_initiated' | 'confirmed' | 'awaiting_admin' | 'processing' | 'issued' | 'failed' | 'rejected';
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

export interface BadgeDesignRecord {
  _id: string;
  imageUrl: string;
  originalName?: string;
  month: number;
  year: number;
  active: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  actor: string;
  details: unknown;
  outcome: string;
  createdAt: string;
}

// ---- audit-chain integrity (GET/POST /api/admin/integrity/*) ----
export interface IntegrityDivergence {
  seq: number;
  reason: string;
}

export interface IntegrityStatus {
  ok: boolean;
  chain: {
    length: number;
    headSeq: number;
    headHash: string | null;
    valid: boolean;
    firstDivergence: IntegrityDivergence | null;
  };
  anchors: {
    mismatch: boolean;
    chainBroken: boolean;
    chainIssue: (IntegrityDivergence & { date?: string }) | null;
    total: number;
    last: {
      date: string;
      headSeq: number;
      headHash: string;
      status: string;
      onChainTxHash: string | null;
    } | null;
    lastConfirmedAt: string | null;
  };
  mode: 'anchored' | 'unanchored-mode';
  hmacSecretConfigured: boolean;
}

export interface IntegrityVerifyResult {
  ok: boolean;
  valid: boolean;
  headSeq: number;
  headHash: string | null;
  totalEntries: number;
  firstDivergence: IntegrityDivergence | null;
  anchorMismatch: boolean;
  anchorChain: { broken: boolean; reason?: string; seq?: number; date?: string; totalAnchors?: number };
  checkedAt: string;
}

export interface LiquidityActivityItem {
  _id: string;
  // Free-form on purpose: the backend enum grows over time (buy, withdraw,
  // reconciliation, mallpoints_convert + mallpoints_purchase, reward,
  // transfer, faucet, refund, …). Panels must render unknown flows
  // gracefully — see LIQUIDITY_FLOW_LABELS in CategoryPage.
  flow: string;
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
  resolutionNote?: string;
  resolvedBy?: string;
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
  status: 'pending_review' | 'payout_initiated' | 'completed' | 'failed' | 'refunded';
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

export interface ChainStatus {
  blockHeight: number;
  blockTime: string | null;
  chainId: string;
  nodeVersion: string;
  moniker: string;
  syncing: boolean;
  latestBlockHash: string | null;
  peerCount: number;
  txCountInBlock: number;
}

export interface ChainBlock {
  height: number;
  hash: string;
  proposer: string;
  time: string;
  txCount: number;
}

export interface ChainValidator {
  moniker: string;
  operatorAddress: string;
  consensusAddress: string;
  status: string;
  tokens: string;
  commission: string;
  jailed: boolean;
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

  /** Decision history (approved/rejected) with reviewedBy/reviewedAt, paginated. */
  async listReviewedKyc(params?: { page?: number; limit?: number }): Promise<ApiResult<{ submissions: AdminReviewedKyc[]; total: number; page: number; limit: number }>> {
    const query: Record<string, string | number> = {};
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return api.get('/api/admin/kyc/reviewed', Object.keys(query).length ? query : undefined);
  }

  /** Identity bundle a KYC reviewer needs to expand an applicant row. */
  async getKycUserDetail(userId: string): Promise<ApiResult<AdminKycUserDetail>> {
    return api.get(`/api/admin/kyc/user/${encodeURIComponent(userId)}`);
  }

  async listReviewedAml(params?: { page?: number; limit?: number }): Promise<ApiResult<{ reviews: AdminReviewedAml[]; total: number; page: number; limit: number }>> {
    const query: Record<string, string | number> = {};
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    return api.get('/api/admin/aml-reviews/reviewed', Object.keys(query).length ? query : undefined);
  }

  // Screenshot proof upload used by every admin review action below.
  // Backend (/api/admin/proof) writes the file under PROOFS_UPLOAD_DIR
  // with the admin's userId as filename prefix; the returned documentRef
  // must then be sent with reviewKyc / approveSubmission / rejectSubmission
  // or the backend 400s with "screenshotRef is required".
  async uploadAdminProof(file: File): Promise<ApiResult<{ ok: true; documentRef: string }>> {
    const fd = new FormData();
    fd.append('proof', file);
    return api.upload<{ ok: true; documentRef: string }>('/api/admin/proof', fd);
  }

  async reviewKyc(id: string, action: 'approved' | 'rejected', screenshotRef: string, notes?: string): Promise<ApiResult<{ kyc: AdminKycSubmission }>> {
    return api.post(`/api/admin/kyc/${encodeURIComponent(id)}/review`, { action, notes, screenshotRef });
  }

  async listPendingAmlReviews(): Promise<ApiResult<{ reviews: AdminAmlReview[]; total: number }>> {
    return api.get('/api/admin/aml-reviews/pending');
  }

  async reviewAmlSubmission(id: string, action: 'approved' | 'rejected', notes?: string): Promise<ApiResult<{ review: AdminAmlReview }>> {
    return api.post(`/api/admin/aml-reviews/${encodeURIComponent(id)}/review`, { action, notes });
  }

  async listStructuringFlags(acknowledged?: boolean): Promise<ApiResult<{ flags: AdminStructuringFlag[]; total: number }>> {
    return api.get('/api/admin/structuring-flags', acknowledged === undefined ? undefined : { acknowledged: String(acknowledged) });
  }

  async acknowledgeStructuringFlag(id: string): Promise<ApiResult<{ flag: AdminStructuringFlag }>> {
    return api.post(`/api/admin/structuring-flags/${encodeURIComponent(id)}/acknowledge`, {});
  }

  async listMiningCampaigns(status?: string): Promise<ApiResult<{ campaigns: AdminCampaign[]; total: number }>> {
    return api.get('/api/admin/mining/campaigns', status ? { status } : undefined);
  }

  async listPendingSubmissions(): Promise<ApiResult<{ submissions: AdminSubmission[]; total: number }>> {
    return api.get('/api/admin/mining/submissions/pending');
  }

  async approveSubmission(id: string, screenshotRef: string, rewardAmount?: number): Promise<ApiResult<{ submission: AdminSubmission }>> {
    return api.post(`/api/admin/mining/submissions/${encodeURIComponent(id)}/approve`, {
      screenshotRef,
      ...(rewardAmount ? { rewardAmount } : {}),
    });
  }

  async rejectSubmission(id: string, screenshotRef: string, note?: string): Promise<ApiResult<{ submission: AdminSubmission }>> {
    return api.post(`/api/admin/mining/submissions/${encodeURIComponent(id)}/reject`, { screenshotRef, note });
  }

  /** Campaign creation lives on /api/mines (requireAdmin-gated), not /api/admin. */
  async createCampaign(payload: { creator_id: string; title: string; description?: string; rate_per_task: number; budget_remaining: number }): Promise<ApiResult<AdminCampaign>> {
    return api.post('/api/mines/campaigns', payload);
  }

  /** On-chain governance counters — safe for the blockchain category admin
   *  (requireCategory('blockchain')), unlike /api/admin/dashboard which is
   *  superadmin-only. */
  async getGovernanceStats(): Promise<ApiResult<{ ok: boolean; stats: GovernanceStats; proposals: unknown[]; note?: string }>> {
    return api.get('/api/admin/governance/stats');
  }

  async getAuditLog(params?: { limit?: number; action?: string; actor?: string; page?: number }): Promise<ApiResult<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>> {
    const query: Record<string, string | number> = { limit: params?.limit ?? 50 };
    if (params?.action) query.action = params.action;
    if (params?.actor) query.actor = params.actor;
    if (params?.page) query.page = params.page;
    return api.get('/api/admin/audit', query);
  }

  // ============ AUDIT-CHAIN INTEGRITY (superadmin only) ============
  async getIntegrityStatus(): Promise<ApiResult<IntegrityStatus>> {
    return api.get('/api/admin/integrity/status');
  }

  async runIntegrityVerify(): Promise<ApiResult<IntegrityVerifyResult>> {
    return api.post('/api/admin/integrity/verify', {});
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

  async approveBadge(quoteId: string, walletAddress: string): Promise<ApiResult<{ purchase: AdminBadgePurchase; txHash: string }>> {
    return api.post('/api/admin/badges/approve', { quoteId, walletAddress });
  }

  async rejectBadge(quoteId: string, reason: string): Promise<ApiResult<{ purchase: AdminBadgePurchase }>> {
    return api.post('/api/admin/badges/reject', { quoteId, reason });
  }

  async uploadBadgeDesign(file: File): Promise<ApiResult<{ design: BadgeDesignRecord }>> {
    // Backend field name is `image` (uploadBadgeImage.single('image')); the
    // month/year are taken from the server clock, not the client.
    const fd = new FormData();
    fd.append('image', file);
    return api.upload<{ design: BadgeDesignRecord }>('/api/admin/badges/design', fd);
  }

  /** Absolute URL for the active badge design image (streams via GET /badges/design/image). */
  badgeDesignImageUrl(): string {
    return `${config.apiBaseUrl}/api/admin/badges/design/image?t=${Date.now()}`;
  }

  async getBadgeDesign(): Promise<ApiResult<{ design: BadgeDesignRecord | null }>> {
    return api.get('/api/admin/badges/design');
  }

  async listLiquidityActivity(params?: {
    flow?: string;
    limit?: number;
    walletAddress?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResult<{ items: LiquidityActivityItem[]; total: number }>> {
    const query: Record<string, string | number> = {};
    if (params?.flow) query.flow = params.flow;
    if (params?.limit) query.limit = params.limit;
    if (params?.walletAddress) query.walletAddress = params.walletAddress;
    if (params?.startDate) query.startDate = params.startDate;
    if (params?.endDate) query.endDate = params.endDate;
    return api.get('/api/liquidity/activity', query);
  }

  async listReconciliationItems(status?: string): Promise<ApiResult<{ items: ReconciliationItem[]; total: number }>> {
    return api.get('/api/admin/reconciliation/items', status ? { status } : undefined);
  }

  async runReconciliation(): Promise<ApiResult<{ result: unknown }>> {
    return api.post('/api/admin/reconciliation/run', {});
  }

  /** Record-keeping only — does not itself perform any on-chain reversal. */
  async resolveReconciliationItem(id: string, note: string): Promise<ApiResult<{ item: ReconciliationItem }>> {
    return api.post(`/api/admin/reconciliation/${encodeURIComponent(id)}/resolve`, { note });
  }

  async listWithdrawals(status?: string): Promise<ApiResult<{ withdrawals: AdminWithdrawalRequest[]; total: number }>> {
    return api.get('/api/admin/withdrawals', status ? { status } : undefined);
  }

  /** Re-attempts the Safaricom B2C payout for a withdrawal whose prior attempt failed. */
  async retryWithdrawal(id: string): Promise<ApiResult<{ withdrawal: AdminWithdrawalRequest }>> {
    return api.post(`/api/admin/withdrawals/${encodeURIComponent(id)}/retry`, {});
  }

  /** Records how a failed withdrawal was actually settled outside the automated payout path. */
  async resolveWithdrawal(id: string, outcome: 'completed' | 'refunded', note: string): Promise<ApiResult<{ withdrawal: AdminWithdrawalRequest }>> {
    return api.post(`/api/admin/withdrawals/${encodeURIComponent(id)}/resolve`, { outcome, note });
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

  /**
   * Live escrow deals for the Marketplace window — GET /api/marketplace/escrow
   * relays the x/marketplace on-chain escrow query (chain REST on :1317).
   * Public by design (external e-commerce integration), not admin-gated.
   */
  async listMarketplaceEscrows(params?: { buyer?: string; seller?: string }): Promise<ApiResult<{ success: boolean; escrows?: unknown[]; error?: string }>> {
    const query: Record<string, string> = {};
    if (params?.buyer) query.buyer = params.buyer;
    if (params?.seller) query.seller = params.seller;
    return api.get('/api/marketplace/escrow', Object.keys(query).length ? query : undefined);
  }

  async getMaintenance(): Promise<ApiResult<MaintenanceState>> {
    return api.get('/api/admin/maintenance');
  }

  /** Toggling requires superadmin (backend/src/routes/adminPanel.js). */
  async setMaintenance(payload: { global?: boolean; scope?: string; paused?: boolean; reason?: string }): Promise<ApiResult<MaintenanceState>> {
    return api.post('/api/admin/maintenance', payload);
  }

  async getChainStatus(): Promise<ApiResult<{ status: ChainStatus }>> {
    return api.get('/api/admin/chain/status');
  }

  async getChainBlocks(limit = 10): Promise<ApiResult<{ blocks: ChainBlock[] }>> {
    return api.get('/api/admin/chain/blocks', { limit });
  }

  async getChainValidators(): Promise<ApiResult<{ validators: ChainValidator[]; bondedTokens: string }>> {
    return api.get('/api/admin/chain/validators');
  }

  async broadcastNotification(payload: { title: string; message: string; type?: string; channels?: { email?: boolean; sms?: boolean; whatsapp?: boolean; inApp?: boolean } }): Promise<ApiResult<{ recipientCount: number }>> {
    return api.post('/api/admin/notifications/broadcast', payload);
  }

  // ============ CATEGORY ADMIN PROVISIONING (superadmin only) ============
  async createCategoryAdmin(payload: { email: string; password: string; name?: string; adminCategory: string }): Promise<ApiResult<{ user: AdminUser }>> {
    return api.post('/api/admin/users', payload);
  }

  async reassignCategory(userId: string, adminCategory: string): Promise<ApiResult<{ user: AdminUser }>> {
    return api.patch(`/api/admin/users/${userId}/category`, { adminCategory });
  }

  // ============ PRESENCE ============
  async getPresence(): Promise<ApiResult<PresenceState>> {
    return api.get('/api/admin/presence');
  }

  // ============ REPORTS ============
  async submitReport(payload: { subject: string; body: string }): Promise<ApiResult<{ report: ReportRecord }>> {
    return api.post('/api/admin/reports', payload);
  }

  async listReports(): Promise<ApiResult<{ reports: ReportRecord[] }>> {
    return api.get('/api/admin/reports');
  }

  async markReportRead(id: string): Promise<ApiResult<{ report: ReportRecord }>> {
    return api.patch(`/api/admin/reports/${id}/read`);
  }

  async markReportActioned(id: string, reply?: string): Promise<ApiResult<{ report: ReportRecord }>> {
    return api.patch(`/api/admin/reports/${id}/action`, { reply });
  }
}

export interface PresenceState {
  ok: boolean;
  superadminOnline: boolean;
  lastSeenAt: string | null;
  lastSeenEmail: string | null;
}

export interface ReportRecord {
  _id: string;
  fromCategory: 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports';
  subject: string;
  body: string;
  status: 'sent' | 'read' | 'actioned';
  createdAt: string;
  readAt?: string;
  actionedAt?: string;
  superadminReply?: string;
  repliedAt?: string;
}

export interface MaintenanceState {
  ok: boolean;
  global: boolean;
  scopes: Record<string, boolean>;
  reason: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export const adminApi = new AdminApi();
