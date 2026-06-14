// Delivery API functions
import { api } from '../services/api';
import type {
    DeliveryTask,
    DeliveryWallet,
    RateDeliveryRequest,
    DeliveryTasksResponse,
} from '../types';

// Agent Stats Interface
export interface AgentStats {
    activeTasks: number;
    totalCompleted: number;
    todayCompleted: number;
    successRate: number;
    rating: number;
    todayEarnings: number;
    totalEarnings: number;
    online: boolean;
    dailyGoal: number;
    goalProgress: number;
    deliveriesRemaining: number;
}

// Agent Earnings Interface
export interface AgentEarnings {
    today: number;
    week: number;
    month: number;
    total: number;
    available: number;
    pending: number;
    todayDeliveries: number;
    weekDeliveries: number;
    monthDeliveries: number;
}

// Agent History Interface
export interface AgentHistoryResponse {
    tasks: DeliveryTask[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

/**
 * Get available delivery tasks
 */
export async function getDeliveryTasks(): Promise<DeliveryTask[]> {
    const response = await api.get<DeliveryTasksResponse>('/delivery/tasks');
    return response.data.tasks || response.data.data || [];
}

/**
 * Get a single delivery task
 */
export async function getDeliveryTask(id: string): Promise<DeliveryTask> {
    const response = await api.get<DeliveryTask>(`/delivery/task/${id}`);
    return response.data;
}

/**
 * Accept a delivery task
 */
export async function acceptTask(taskId: string): Promise<void> {
    await api.post('/delivery/agent/accept', { taskId });
}

/**
 * Mark task as picked up
 */
export async function pickupTask(taskId: string): Promise<void> {
    await api.post('/delivery/pickup', { taskId });
}

/**
 * Mark task as delivered
 */
export async function deliverTask(taskId: string): Promise<void> {
    await api.post('/delivery/deliver', { taskId });
}

/**
 * Rate a delivery
 */
export async function rateDelivery(data: RateDeliveryRequest): Promise<void> {
    await api.post('/delivery/rate', data);
}

/**
 * Get delivery agent wallet
 */
export async function getDeliveryWallet(): Promise<DeliveryWallet> {
    // Use agent earnings endpoint which returns improved wallet/earnings data
    const response = await api.get<AgentEarnings>('/agent/earnings');
    const data = response.data;

    return {
        available: data.available || 0,
        pending: data.pending || 0,
        total: data.total || 0,
        balance: data.available || 0,
        earnings: data.total || 0,
    };
}

/**
 * Withdraw delivery earnings
 */
export async function withdrawDeliveryEarnings(amount: number): Promise<void> {
    // Use general wallet withdraw endpoint
    await api.post('/wallet/withdraw', { amount });
}

// ============ NEW AGENT ENDPOINTS ============

/**
 * Get agent statistics (dashboard data)
 */
export async function getAgentStats(): Promise<AgentStats> {
    const response = await api.get<AgentStats>('/agent/stats');
    return response.data;
}

/**
 * Get agent earnings breakdown
 */
export async function getAgentEarnings(): Promise<AgentEarnings> {
    const response = await api.get<AgentEarnings>('/agent/earnings');
    return response.data;
}

/**
 * Get agent delivery history
 */
export async function getAgentHistory(page = 1, limit = 20, status?: string): Promise<AgentHistoryResponse> {
    const params: Record<string, any> = { page, limit };
    if (status) params.status = status;
    const response = await api.get<AgentHistoryResponse>('/agent/history', { params });
    return response.data;
}

/**
 * Toggle agent online status
 */
export async function toggleAgentOnline(online?: boolean): Promise<{ success: boolean; online: boolean }> {
    const response = await api.post<{ success: boolean; online: boolean }>('/agent/online', { online });
    return response.data;
}

/**
 * Get agent profile
 */
export async function getAgentProfile(): Promise<any> {
    const response = await api.get('/agent/me');
    return response.data;
}

/**
 * Update agent profile
 */
export async function updateAgentProfile(data: { displayName?: string; phone?: string; vehicle?: any }): Promise<any> {
    const response = await api.put('/agent/profile', data);
    return response.data;
}
