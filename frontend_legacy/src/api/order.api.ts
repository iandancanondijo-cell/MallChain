// Order API functions
import { api } from '../services/api';
import type {
    Order,
    CheckoutRequest,
    CheckoutResponse,
    OrderStatusResponse,
} from '../types';

/**
 * List user's orders
 */
export async function listOrders(): Promise<Order[]> {
    const response = await api.get<{ orders: Order[] }>('/orders');
    return response.data.orders || [];
}

/**
 * Get seller's orders
 */
export async function getSellerOrders(): Promise<Order[]> {
    const response = await api.get<{ orders: Order[] }>('/order');
    return response.data.orders || [];
}

/**
 * Get a single order by ID
 */
export async function getOrder(id: string): Promise<Order> {
    const response = await api.get<Order>(`/orders/${id}`);
    return response.data;
}

/**
 * Approve an order (seller only)
 */
export async function approveOrder(id: string): Promise<void> {
    await api.put(`/order/${id}`, { status: 'approved' });
}

/**
 * Checkout and create an order
 */
export async function checkout(data: CheckoutRequest): Promise<CheckoutResponse> {
    const response = await api.post<CheckoutResponse>('/checkout', data);
    return response.data;
}

/**
 * Checkout using Mallmoney
 */
export async function checkoutMallmoney(data: {
    items: any[];
    shippingFee?: number;
    deliveryAddress?: string;
}): Promise<{ ok: boolean; order: Order }> {
    const response = await api.post<{ ok: boolean; order: Order }>('/checkout/mallmoney', data);
    return response.data;
}

/**
 * Checkout using Mallcoins
 */
export async function checkoutMallcoins(data: {
    items: any[];
    shippingFee?: number;
    deliveryAddress?: string;
}): Promise<{ ok: boolean; order: Order }> {
    const response = await api.post<{ ok: boolean; order: Order }>('/checkout/mallcoins', data);
    return response.data;
}

/**
 * Get order status
 */
export async function getOrderStatus(id: string): Promise<OrderStatusResponse> {
    const response = await api.get<OrderStatusResponse>(`/orders/${id}/status`);
    return response.data;
}

/**
 * Sync cart with server
 */
/**
 * Sync cart with server
 */
export async function syncCart(items: any[]): Promise<void> {
    await api.post('/cart/sync', { items });
}

/**
 * Get full tracking details for an order
 */
export async function getOrderTracking(id: string): Promise<any> {
    const response = await api.get(`/orders/${id}/tracking`);
    return response.data;
}
