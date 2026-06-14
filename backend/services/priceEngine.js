/**
 * Real-time price engine for Mallcoin
 * Simulates supply/demand based trading dynamics
 */

class PriceEngine {
  constructor() {
    this.price = 1.0;
    this.volume24h = 0;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.maxHistoryLength = 1000;
  }

  /**
   * Process a buy transaction and update price
   */
  processBuy(volumeUmal) {
    // Convert to decimals
    const volume = volumeUmal / 1000000;
    
    // Price impact: larger buys have exponential impact
    // impact = volume * 0.0001 * (1 + volume/1000)
    const impact = volume * 0.0001 * (1 + Math.max(0, volume / 1000));
    
    this.price += impact;
    this.volume24h += volume;

    const event = {
      type: 'buy',
      volume,
      impact,
      price: this.price,
      timestamp: Date.now()
    };

    this.recordPriceEvent(event);
    
    if (global.io) {
      global.io.emit('price:update', event);
    }

    return event;
  }

  /**
   * Process a sell transaction and update price
   */
  processSell(volumeUmal) {
    // Convert to decimals
    const volume = volumeUmal / 1000000;
    
    // Sell pressure: reduces price
    const impact = -(volume * 0.00008 * (1 + Math.max(0, volume / 1000)));
    
    this.price = Math.max(0.001, this.price + impact); // Floor at 0.001
    this.volume24h += volume;

    const event = {
      type: 'sell',
      volume,
      impact,
      price: this.price,
      timestamp: Date.now()
    };

    this.recordPriceEvent(event);

    if (global.io) {
      global.io.emit('price:update', event);
    }

    return event;
  }

  /**
   * Record price event in history
   */
  recordPriceEvent(event) {
    this.priceHistory.push({
      price: event.price,
      volume: event.volume,
      timestamp: event.timestamp,
      type: event.type
    });

    // Keep history bounded
    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }
  }

  /**
   * Get current market data
   */
  getMarketData() {
    return {
      price: this.price,
      volume24h: this.volume24h,
      priceChange: this.getPriceChange(),
      history: this.priceHistory.slice(-100) // Last 100 events
    };
  }

  /**
   * Calculate price change percentage
   */
  getPriceChange() {
    if (this.priceHistory.length < 2) return 0;
    
    const oldPrice = this.priceHistory[0].price;
    const newPrice = this.price;
    
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  /**
   * Get price history for charting
   */
  getPriceHistory(limit = 100) {
    return this.priceHistory.slice(-limit).map(event => ({
      price: event.price,
      timestamp: event.timestamp
    }));
  }

  /**
   * Reset volume for new day
   */
  resetDailyVolume() {
    this.volume24h = 0;
  }
}

// Global instance
const priceEngine = new PriceEngine();

module.exports = {
  priceEngine,
  PriceEngine
};
