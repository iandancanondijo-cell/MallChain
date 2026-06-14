// Delivery types based on backend DeliveryTask and DeliveryAgent models

export interface DeliveryLocation {
    lat: number;
    lng: number;
    address?: string;
    updatedAt?: string | Date;
}

export interface DeliveryTask {
    _id?: string;
    id?: string;
    orderId?: string;
    buyerId?: string;
    sellerId?: string;
    pickupLocation?: DeliveryLocation;
    deliveryLocation?: DeliveryLocation;
    dropoffLocation?: DeliveryLocation;
    status: 'unassigned' | 'pending' | 'assigned' | 'accepted' | 'enroute_pickup' | 'picked_up' | 'enroute_dropoff' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
    assignedAgentId?: string;
    agentId?: string;
    agentName?: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    sellerName?: string;
    fee?: number;
    agentPayout?: number;
    distance?: number;
    estimatedTime?: number;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    pickedAt?: string | Date;
    pickedUpAt?: string | Date;
    deliveredAt?: string | Date;
    progress?: number;
    routePolylineEncoded?: string;
    routePolylineCoords?: Array<{ lat: number; lng: number }>;
    expectedDurationSec?: number;
    actualDurationSec?: number;
    pickupAddress?: string;
    rewardAmount?: number;
    reasonTags?: string[];
    proof?: {
        pickupPhoto?: string;
        dropoffPhoto?: string;
        signatureImage?: string;
    };
    rating?: {
        buyerRating?: number;
        sellerRating?: number;
        buyerComment?: string;
        sellerComment?: string;
    };
    task?: any;
}

export interface DeliveryAgent {
    _id?: string;
    id?: string;
    userId: string;
    name: string;
    phone: string;
    vehicleType?: string;
    vehicleNumber?: string;
    online?: boolean;
    available?: boolean;
    rating?: number;
    totalDeliveries?: number;
    lastLocation?: DeliveryLocation;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface DeliveryWallet {
    available?: number;
    pending?: number;
    total?: number;
    balance?: number;
    earnings?: number;
    availableDisplay?: string;
    pendingDisplay?: string;
}

export interface RateDeliveryRequest {
    taskId: string;
    role: 'customer' | 'agent';
    rating: number;
    comment?: string;
}

export interface DeliveryTasksResponse {
    tasks?: DeliveryTask[];
    data?: DeliveryTask[];
}

export interface DeliveryWalletResponse {
    wallet?: DeliveryWallet;
    data?: DeliveryWallet;
}
