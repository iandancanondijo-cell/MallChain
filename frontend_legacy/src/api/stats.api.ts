
// Stats API functions
import { api } from '../services/api';
import { listOrders } from './order.api';
import type { PublicStats, SellerStats, BuyerStats, Order } from '../types';

/**
 * Get public platform statistics
 */
export async function getPublicStats(): Promise<PublicStats> {
    try {
        const response = await api.get('/stats/public');
        return response.data;
    } catch (e) {
        console.warn('Failed to fetch public stats', e);
        return {
            activeUsers: 0,
            mallcoinVolume: 0,
            mallpointsEarned: 0
        };
    }
}

/**
 * Get seller statistics
 */
export async function getSellerStats(): Promise<SellerStats> {
    try {
        const response = await api.get('/seller/stats');
        return response.data;
    } catch (e) {
        console.warn('Failed to fetch seller stats', e);
        return {
            totalSales: 0,
            totalOrders: 0,
            pendingOrders: 0,
            totalProducts: 0,
            activeProducts: 0
        };
    }
}

/**
 * Get buyer statistics (derived from orders)
 */
export async function getBuyerStats(): Promise<BuyerStats> {
    try {
        const orders = await listOrders();

        const activeOrders = orders.filter((o: Order) =>
            ['pending', 'processing', 'shipped', 'out_for_delivery'].includes(o.status?.toLowerCase() || '')
        ).length;

        // Calculate total spent safely
        const totalSpent = orders.reduce((sum: number, o: Order) => {
            const amount = o.total || 0;
            return sum + amount;
        }, 0);

        // Placeholder for points - would need real wallet data or points history
        const pointsEarned = Math.floor(totalSpent / 100);

        return {
            activeOrders,
            totalSpent,
            pointsEarned,
            tasksCompleted: 0 // Placeholder
        };
    } catch (e) {
        console.warn('Failed to calculate buyer stats', e);
        return {
            activeOrders: 0,
            totalSpent: 0,
            pointsEarned: 0,
            tasksCompleted: 0
        };
    }
}
/**
 * Get admin summary statistics
 */
export async function getAdminSummary(): Promise<any> {
    const response = await api.get('/admin/analytics/summary');
    return response.data;
}

/**
 * Get admin timeseries data
 */
export async function getAdminTimeSeries(days: number = 30): Promise<any> {
    const response = await api.get(`/admin/analytics/timeseries?days=${days}`);
    return response.data;
}
