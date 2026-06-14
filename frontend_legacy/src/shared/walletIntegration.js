/**
 * Wallet Integration Layer
 * Allows E-Commerce module to access wallet data and functionality
 * Keeps modules separate but linked through a clean API
 */

import { useWallet } from './WalletContext';

/**
 * Hook for E-Commerce to access wallet data
 * Use this in e-commerce components to display wallet info
 */
export function useWalletIntegration() {
  const { walletState, user } = useWallet();

  return {
    // Wallet info
    walletAddress: walletState.address,
    walletBalance: walletState.balance,
    mallcoins: walletState.mallcoins,
    mallpoints: walletState.mallpoints,
    isWalletConnected: walletState.isConnected,
    
    // User info
    userId: user.id,
    userRoles: user.roles,
    
    // Check if user has both wallet and ecommerce roles
    hasWalletRole: user.roles?.includes('wallet'),
    hasEcommerceRole: user.roles?.includes('ecommerce'),
  };
}

/**
 * Service for cross-module wallet transactions
 * E-commerce calls this to process payments from wallet
 */
export class WalletPaymentService {
  /**
   * Process a purchase payment from wallet
   */
  static async processWalletPayment(orderId, amount, fromAddress) {
    try {
      const response = await fetch('/api/wallet/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,
          fromAddress,
          type: 'ecommerce_purchase',
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Payment processing failed');
      return await response.json();
    } catch (error) {
      console.error('Wallet payment error:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance for display in e-commerce
   */
  static async getWalletBalance(address) {
    try {
      const response = await fetch(`/api/wallet/balance/${address}`);
      if (!response.ok) throw new Error('Failed to fetch balance');
      return await response.json();
    } catch (error) {
      console.error('Balance fetch error:', error);
      throw error;
    }
  }

  /**
   * Link e-commerce order to wallet transaction
   */
  static async linkTransaction(orderId, transactionId) {
    try {
      const response = await fetch('/api/wallet/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transactionId }),
      });

      if (!response.ok) throw new Error('Failed to link transaction');
      return await response.json();
    } catch (error) {
      console.error('Transaction linking error:', error);
      throw error;
    }
  }
}

/**
 * Event emitter for cross-module communication
 * Wallet module emits events, e-commerce listens
 */
export class CrossModuleEvents {
  static #listeners = {};

  static on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  static off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  static emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }
}

// Example events:
// CrossModuleEvents.emit('wallet:balanceUpdated', { newBalance: 1000 })
// CrossModuleEvents.emit('wallet:paymentCompleted', { orderId, transactionId })
