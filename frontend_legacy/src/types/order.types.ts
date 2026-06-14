// Order types based on backend Order model

export interface OrderItem {
    productId?: string;
    name?: string;
    title?: string;
    price: number;
    qty?: number;
    quantity?: number;
    image?: string;
}

export interface Order {
    _id?: string;
    id?: string;
    userId?: string;
    buyerId?: string;
    buyerName?: string;
    buyerPhone?: string;
    buyerEmail?: string;
    seller?: string;
    items: OrderItem[];
    total: number;
    status: string;
    paymentMethod?: string;
    shippingAddress?: any;
    createdAt: string; // Force string for easy Date construction in UI
    updatedAt?: string;
    approvedAt?: string;
}

export interface CheckoutRequest {
    items: OrderItem[];
    total: number;
    paymentMethod: string;
    shippingAddress?: any;
}

export interface CheckoutResponse {
    transaction?: {
        id: string;
        amount: number;
        currency: string;
        date: string;
        items: OrderItem[];
    };
    order?: Order;
    success?: boolean;
}

export interface OrderStatusResponse {
    status: string;
    order?: Order;
    deliveryPerson?: {
        name: string;
        phone: string;
    };
}
