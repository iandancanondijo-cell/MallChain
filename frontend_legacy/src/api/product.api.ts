// Product API functions
import { api } from '../services/api';
import type {
    Product,
    ProductListParams,
    ProductListResponse,
} from '../types';

/**
 * List products with optional filters
 */
export async function listProducts(params?: ProductListParams): Promise<ProductListResponse> {
    const response = await api.get<{ items: Product[], total: number, page: number, limit: number }>('/products', { params });
    return {
        products: response.data.items || [],
        total: response.data.total || 0,
        page: response.data.page || 1,
        limit: response.data.limit || 24
    };
}

/**
 * Get a single product by ID
 */
export async function getProduct(id: string): Promise<Product> {
    const response = await api.get<{ product: Product }>(`/products/${id}`);
    return response.data.product || (response.data as any);
}

/**
 * Create a new product (seller only)
 */
export async function createProduct(formData: FormData): Promise<Product> {
    const response = await api.post<{ product: Product }>('/products', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data.product || response.data;
}

/**
 * Update an existing product (seller only)
 */
export async function updateProduct(id: string, formData: FormData): Promise<Product> {
    const response = await api.put<{ product: Product }>(`/products/${id}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data.product || response.data;
}

/**
 * Delete a product (seller only)
 */
export async function deleteProduct(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
}

/**
 * Get seller's product inventory
 */
/**
 * Get seller's product inventory
 */
export async function getSellerInventory(): Promise<Product[]> {
    const response = await api.get<{ products: Product[] }>('/products/seller/inventory');
    return response.data.products || [];
}

/**
 * Get featured products for dashboard
 */
export async function getFeaturedProducts(): Promise<Product[]> {
    const response = await api.get<{ products: Product[] }>('/products/featured');
    return response.data.products || [];
}

/**
 * Get trending products
 */
export async function getTrendingProducts(): Promise<Product[]> {
    const response = await api.get<{ products: Product[] }>('/products/trending');
    return response.data.products || [];
}

/**
 * Get recommended products for user
 */
export async function getRecommendedProducts(): Promise<Product[]> {
    const response = await api.get<{ products: Product[] }>('/products/recommended');
    return response.data.products || [];
}
