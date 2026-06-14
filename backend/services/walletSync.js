const axios = require('axios');

/**
 * Real-time wallet synchronization service
 * Fetches and broadcasts wallet balance updates
 */

const CHAIN_REST = process.env.CHAIN_REST_URL || 'http://localhost:1317';

class WalletSyncService {
  constructor() {
    this.walletCache = new Map();
    this.updateInterval = 5000; // Poll every 5 seconds
    this.subscribers = new Set();
  }

  /**
   * Fetch wallet balance from chain
   */
  async fetchWalletBalance(address) {
    try {
      const res = await axios.get(
        `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`,
        { timeout: 5000 }
      );

      return {
        address,
        balances: res.data.balances || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching wallet ${address}:`, error.message);
      return null;
    }
  }

  /**
   * Trigger wallet update for an address
   */
  async updateWallet(address) {
    const walletData = await this.fetchWalletBalance(address);

    if (!walletData) {
      console.warn(`Failed to update wallet ${address}`);
      return;
    }

    // Cache the wallet data
    this.walletCache.set(address, walletData);

    // Broadcast update
    if (global.io) {
      global.io.emit('wallet:update', {
        address,
        balances: walletData.balances,
        timestamp: walletData.timestamp
      });
    }

    return walletData;
  }

  /**
   * Broadcast wallet update to specific address subscribers
   */
  broadcastWalletUpdate(address, data) {
    if (global.io) {
      global.io.emit(`wallet:${address}`, data);
    }
  }

  /**
   * Subscribe to wallet updates
   */
  subscribeToWallet(address, callback) {
    this.subscribers.add({ address, callback });

    if (global.io) {
      global.io.on(`wallet:${address}`, callback);
    }

    return () => {
      this.subscribers.delete({ address, callback });
    };
  }

  /**
   * Get cached wallet data
   */
  getCachedWallet(address) {
    return this.walletCache.get(address) || null;
  }

  /**
   * Clear cache for an address
   */
  clearCache(address) {
    this.walletCache.delete(address);
  }

  /**
   * Get all cached wallets
   */
  getAllCachedWallets() {
    return Array.from(this.walletCache.values());
  }
}

const walletSyncService = new WalletSyncService();

module.exports = {
  walletSyncService,
  WalletSyncService
};
