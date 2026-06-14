// Common API types used across the application

export interface ApiResponse<T = any> {
    success?: boolean;
    data?: T;
    message?: string;
    error?: string | ApiError;
}

export interface ApiError {
    code?: string;
    message: string;
    details?: any;
    path?: string;
}

export interface PaginatedResponse<T> {
    data?: T[];
    items?: T[];
    products?: T[]; // For product listings
    orders?: T[]; // For order listings
    shops?: T[]; // For shop listings
    transactions?: T[]; // For transaction listings
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
}
