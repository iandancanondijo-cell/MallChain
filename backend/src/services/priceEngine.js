// Stub: price engine service
const priceEngine = {
  getMarketData: () => ({ mallcoin: { usd: 0, kes: 0 }, mlpts: { usd: 0, kes: 2 } }),
  resetDailyVolume: () => {},
};

module.exports = { priceEngine };
