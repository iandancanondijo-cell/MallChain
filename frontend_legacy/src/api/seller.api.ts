import { api } from '../services/api';
import type { Order } from '../types';

/**
 * Get seller orders
 */
export async function getSellerOrders(): Promise<Order[]> {
    const response = await api.get<{ orders: Order[] }>('/seller/orders');
    return response.data.orders || [];
}

/**
 * Approve an order
 */
export async function approveOrder(orderId: string): Promise<void> {
    await api.post(`/seller/orders/${orderId}/approve`);
}

/**
 * Update order status
 */
export async function updateOrderStatus(orderId: string, status: string): Promise<Order> {
    const response = await api.put<{ success: true, order: Order }>(`/seller/orders/${orderId}/status`, { status });
    return response.data.order;
}

/**
 * Get seller dashboard stats
 */
export async function getSellerDashboard(): Promise<any> {
    const response = await api.get('/seller/dashboard');
    return response.data;
}
