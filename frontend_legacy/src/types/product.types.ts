// Product and Shop types based on backend models

export interface ProductImage {
    url?: string;
    filename?: string;
    alt?: string;
}

export interface ProductVariant {
    sku?: string;
    attrs?: Record<string, any>;
    price?: number;
    stock?: number;
    images?: ProductImage[];
}

export interface Review {
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    rating: number;
    comment: string;
    date: string | Date;
}

export interface Product {
    _id?: string;
    id?: string;
    title?: string;
    name?: string; // Some components use 'name' instead of 'title'
    slug?: string;
    description?: string;
    price: number;
    discount?: number;
    currency?: string;
    images?: ProductImage[] | string[];
    primaryImage?: ProductImage;
    variants?: ProductVariant[];
    sellerId?: string;
    shopId?: string;
    shopName?: string;
    category?: string;
    subcategory?: string;
    condition?: 'new' | 'pre-owned' | 'New' | 'Pre-owned';
    stockQty?: number;
    totalUnits?: number;
    remaining?: number;
    unitType?: string;
    lowStockThreshold?: number;
    warranty?: {
        available: boolean;
        durationMonths: number;
    };
    returnPolicy?: {
        accepted: boolean;
        durationDays: number;
    };
    seoTags?: string[];
    averageRating?: number;
    ratingCount?: number;
    views?: number;
    clicks?: number;
    status?: 'active' | 'out_of_stock' | 'hidden' | 'paused' | 'deleted';
    salesCount?: number;
    revenue?: number;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    isSupermarketItem?: boolean;
    isNew?: boolean;
    rating?: number;
    originalPrice?: number;
    reviewsCount?: number;
    reviews?: Review[];
}

export interface Shop {
    _id?: string;
    id?: string;
    name?: string;
    shopName?: string;
    location?: string;
    images?: any[];
    createdAt?: string | Date;
    rentPaid?: boolean;
    lastRent?: {
        paidAt: string;
        amount: number;
        method: string;
        tx: string;
    };
}

export interface ProductListParams {
    page?: number;
    limit?: number;
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    sort?: string;
    search?: string;
}

export interface ProductListResponse {
    products: Product[];
    total: number;
    page: number;
    limit: number;
}

export interface CreateProductRequest {
    name: string;
    title?: string;
    description?: string;
    condition: 'New' | 'Pre-owned';
    price: number;
    totalUnits: number;
    images: File[];
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
    id: string;
}
