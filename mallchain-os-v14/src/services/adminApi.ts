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

export interface AuditLogEntry {
  _id: string;
  action: string;
  actor: string;
  details: unknown;
  outcome: string;
  createdAt: string;
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
}

export const adminApi = new AdminApi();
