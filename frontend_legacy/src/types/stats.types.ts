
export interface PublicStats {
    activeUsers: number;
    mallcoinVolume: number;
    mallpointsEarned: number;
}

export interface SellerStats {
    totalSales: number;
    totalOrders: number;
    pendingOrders: number;
    totalProducts: number;
    activeProducts: number;
}

export interface BuyerStats {
    activeOrders: number;
    totalSpent: number;
    pointsEarned: number;
    tasksCompleted: number;
}
