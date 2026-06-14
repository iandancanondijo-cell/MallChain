/**
 * Shared types for Wallet and E-Commerce modules
 * Allows both modules to understand the same data structures
 */

// Wallet/Crypto Types
export interface WalletState {
  address: string | null;
  publicKey: string | null;
  balance: number;
  mallcoins: number;
  mallpoints: number;
  currency: string;
  isConnected: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  roles: UserRole[];
  walletAddress?: string;
  publicKey?: string;
  ecommerceProfile?: ECommerceProfile;
  walletProfile?: WalletProfile;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'wallet' | 'ecommerce' | 'buyer' | 'seller' | 'creator' | 'delivery' | 'admin';

// Wallet module types
export interface WalletProfile {
  totalBalance: number;
  mallcoins: number;
  mallpoints: number;
  transactions: Transaction[];
  linkedEcommerceAccounts: string[];
}

export interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'purchase' | 'sale';
  amount: number;
  currency: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  fromAddress: string;
  toAddress: string;
  description: string;
  referenceId?: string;
}

// E-Commerce module types
export interface ECommerceProfile {
  displayName: string;
  avatar?: string;
  walletAddress: string; // Linked wallet address
  walletBalance: number; // Cached from wallet module
  orders: Order[];
  cart: CartItem[];
  wishlist: WishlistItem[];
  seller?: SellerProfile;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  paidWith: 'mallcoins' | 'fiat' | 'crypto';
  transactionId?: string; // Links to wallet transaction
  createdAt: Date;
}

export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

export interface WishlistItem {
  productId: string;
  addedAt: Date;
}

export interface SellerProfile {
  shopName: string;
  description: string;
  avatar?: string;
  walletAddress: string; // Seller's wallet
  earnings: number;
  totalSales: number;
  rating: number;
  products: Product[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image?: string;
  sellerId: string;
  stock: number;
  rating: number;
  createdAt: Date;
}

// Cross-module communication
export interface WalletTransactionEvent {
  type: 'wallet_payment_completed' | 'wallet_received' | 'balance_updated';
  walletAddress: string;
  amount: number;
  data: any;
  timestamp: Date;
}
