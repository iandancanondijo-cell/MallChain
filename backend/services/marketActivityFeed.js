/**
 * Real-time market activity feed
 * Tracks and broadcasts all market events
 */

class MarketActivityFeed {
  constructor(maxEvents = 500) {
    this.events = [];
    this.maxEvents = maxEvents;
    this.subscribers = new Set();
  }

  /**
   * Add a market event (purchase, swap, stake, etc.)
   */
  addEvent(type, data) {
    const event = {
      id: this.generateId(),
      type, // 'purchase', 'swap', 'stake', 'unstake', 'governance', 'crosschain'
      data,
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString()
    };

    this.events.unshift(event);

    // Keep bounded
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }

    // Broadcast to all connected clients
    if (global.io) {
      global.io.emit('market:event', event);
    }

    return event;
  }

  /**
   * Add purchase event
   */
  addPurchase(buyer, amount, item, price) {
    return this.addEvent('purchase', {
      buyer,
      amount,
      item,
      price,
      value: amount * price
    });
  }

  /**
   * Add swap event
   */
  addSwap(user, tokenAIn, tokenBOut, price) {
    return this.addEvent('swap', {
      user,
      tokenAIn,
      tokenBOut,
      price,
      slippage: this.calculateSlippage(tokenAIn, tokenBOut, price)
    });
  }

  /**
   * Add staking event
   */
  addStake(user, amount, validator) {
    return this.addEvent('stake', {
      user,
      amount,
      validator
    });
  }

  /**
   * Add governance event
   */
  addGovernance(user, proposalId, voteOption) {
    return this.addEvent('governance', {
      user,
      proposalId,
      voteOption
    });
  }

  /**
   * Add cross-chain event
   */
  addCrossChain(user, targetChain, amount) {
    return this.addEvent('crosschain', {
      user,
      targetChain,
      amount
    });
  }

  /**
   * Calculate slippage percentage
   */
  calculateSlippage(input, output, expectedRate) {
    const expectedOutput = input * expectedRate;
    if (expectedOutput === 0) return 0;
    return ((expectedOutput - output) / expectedOutput) * 100;
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 50) {
    return this.events.slice(0, limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(type, limit = 50) {
    return this.events
      .filter(e => e.type === type)
      .slice(0, limit);
  }

  /**
   * Generate unique event ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get activity stats
   */
  getActivityStats() {
    const typeCount = {};
    this.events.forEach(e => {
      typeCount[e.type] = (typeCount[e.type] || 0) + 1;
    });

    return {
      totalEvents: this.events.length,
      types: typeCount,
      recentEvents: this.events.slice(0, 10)
    };
  }

  /**
   * Clear old events (for maintenance)
   */
  clearOldEvents(olderThanMs = 1000 * 60 * 60) { // Default 1 hour
    const cutoff = Date.now() - olderThanMs;
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }
}

// Global instance
const marketFeed = new MarketActivityFeed();

module.exports = {
  marketFeed,
  MarketActivityFeed
};
