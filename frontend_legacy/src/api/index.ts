// Central export for all API functions

// Auth API
export * as authApi from './auth.api';

// Wallet API
export * as walletApi from './wallet.api';

// Product API
export * as productApi from './product.api';

// Shop API
export * as shopApi from './shop.api';

// Order API
export * as orderApi from './order.api';

// Task API
export * as taskApi from './task.api';

// Delivery API
export * as deliveryApi from './delivery.api';

// Stats API
export * as statsApi from './stats.api';

// Admin API
export * as adminApi from './admin.api';

// Profile API
export * as profileApi from './profile.api';

// Re-export individual functions for convenience
export {
    signup,
    login,
    getProfile,
    updateLocation,
    checkUsername,
} from './auth.api';

export {
    getWallet,
    getTransactions,
    deposit,
    withdraw,
    sendMoney,
    convert,
    convertPoints,
    buyMallCoins,
    getConversionWindow,
    getConversionRate,
    createReceiveLink,
    downloadReceipt,
} from './wallet.api';

export {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getSellerInventory,
} from './product.api';

export {
    listShops,
    createShop,
    rentShop,
} from './shop.api';

export {
    listOrders,
    getSellerOrders,
    getOrder,
    approveOrder,
    checkout,
    getOrderStatus,
} from './order.api';

export {
    listTasks,
    createTask,
    submitTask,
    startTask,
    getCreatorTasks,
    getCreatorStats,
} from './task.api';

export {
    getDeliveryTasks,
    getDeliveryTask,
    acceptTask,
    pickupTask,
    deliverTask,
    rateDelivery,
    getDeliveryWallet,
    withdrawDeliveryEarnings,
    getAgentStats,
    getAgentEarnings,
    getAgentHistory,
    toggleAgentOnline,
    getAgentProfile,
    updateAgentProfile,
} from './delivery.api';

export {
    getPublicStats,
    getSellerStats,
    getBuyerStats,
    getAdminSummary,
    getAdminTimeSeries,
} from './stats.api';

// Seller API
export * as sellerApi from './seller.api';

// Notification API
export * as notificationApi from './notification.api';

