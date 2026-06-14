// Shop API functions
import { api } from '../services/api';
import type { Shop } from '../types';

/**
 * List all shops
 */
export async function listShops(): Promise<Shop[]> {
    const response = await api.get<{ shops: Shop[] }>('/shops');
    return response.data.shops || [];
}

/**
 * Create a new shop
 */
export async function createShop(formData: FormData): Promise<Shop> {
    const response = await api.post<{ shop: Shop }>('/shops', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data.shop || response.data;
}

/**
 * Pay rent for a shop
 */
export async function rentShop(id: string, amount: number): Promise<void> {
    await api.post(`/shops/${id}/rent`, { amount });
}
