// Coverage for marketController.js (previously 0%) — proxies/aggregates
// on-chain market price and mlcoin emission data from the chain REST
// gateway, with a local-genesis-file fallback when the chain is unreachable.
//
// The module also starts a `setInterval` background poller as a load-time
// side effect. It previously had no `.unref()`, meaning simply requiring
// this file (as this test does, and as production does) would keep the
// Node process alive on that timer alone — including hanging a test runner
// after the suite finished. Fixed by unref()'ing the interval handle; the
// HTTP server, not a price poller, should be what keeps the process open.
jest.mock('axios');

const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Give the module-load-time poll call (see marketController.js) something
// harmless to resolve so it doesn't fire an unhandled rejection before any
// test-specific mock is configured.
axios.get.mockResolvedValue({ data: {} });

const marketController = require('../controllers/marketController');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('marketController', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  describe('getMarketPrice', () => {
    test('converts scaled chain integers into decimal buy/sell/mid prices', async () => {
      axios.get.mockResolvedValue({
        data: { market_price: { buy_price: 150, sell_price: 160, last_update_height: 42 } },
      });
      const req = {};
      const res = mockRes();
      await marketController.getMarketPrice(req, res);

      expect(res.json).toHaveBeenCalledTimes(1);
      const body = res.json.mock.calls[0][0];
      expect(body.market_price).toEqual(
        expect.objectContaining({ buy_price: 1.5, sell_price: 1.6, mid: 1.55, last_update_height: 42 })
      );
      expect(Array.isArray(body.history)).toBe(true);
      expect(body.aggregates).toBeTruthy();
    });

    test('502s when the chain response has no market_price', async () => {
      axios.get.mockResolvedValue({ data: {} });
      const req = {};
      const res = mockRes();
      await marketController.getMarketPrice(req, res);
      expect(res.status).toHaveBeenCalledWith(502);
    });

    test('502s when the chain REST call fails', async () => {
      axios.get.mockRejectedValue(new Error('econnrefused'));
      const req = {};
      const res = mockRes();
      await marketController.getMarketPrice(req, res);
      expect(res.status).toHaveBeenCalledWith(502);
    });
  });

  describe('getTotalSupply', () => {
    test('converts base-unit supply/circulating into human-readable Mallcoins', async () => {
      axios.get.mockResolvedValue({
        data: { emission_state: { total_supply: 5_000_000, circulating: 2_000_000 } },
      });
      const req = {};
      const res = mockRes();
      await marketController.getTotalSupply(req, res);

      expect(res.json).toHaveBeenCalledWith({
        total_supply: expect.objectContaining({ raw: 5_000_000, supply: 5, circulating_raw: 2_000_000, circulating: 2 }),
      });
    });

    test('falls back to a local genesis.json when the chain is unreachable', async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mallchain-genesis-'));
      fs.mkdirSync(path.join(tmpHome, 'config'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpHome, 'config', 'genesis.json'),
        JSON.stringify({ app_state: { mlcoin: { emission_state: { total_supply: 7_000_000, circulating: 3_000_000 } } } })
      );
      const prevHome = process.env.MARKETPLACED_HOME;
      process.env.MARKETPLACED_HOME = tmpHome;
      axios.get.mockRejectedValue(new Error('econnrefused'));

      try {
        const req = {};
        const res = mockRes();
        await marketController.getTotalSupply(req, res);

        expect(res.json).toHaveBeenCalledWith({
          total_supply: expect.objectContaining({ supply: 7, circulating: 3, fallback: 'genesis' }),
        });
      } finally {
        process.env.MARKETPLACED_HOME = prevHome;
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });

    test('502s when the chain is unreachable and no genesis fallback exists', async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mallchain-nogenesis-'));
      const prevHome = process.env.MARKETPLACED_HOME;
      process.env.MARKETPLACED_HOME = tmpHome;
      axios.get.mockRejectedValue(new Error('econnrefused'));

      try {
        const req = {};
        const res = mockRes();
        await marketController.getTotalSupply(req, res);
        expect(res.status).toHaveBeenCalledWith(502);
      } finally {
        process.env.MARKETPLACED_HOME = prevHome;
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });
  });

  describe('getMonthlyEmissions', () => {
    test('builds a 12-month array with has_emitted true through the current on-chain month', async () => {
      axios.get.mockResolvedValue({
        data: { emission_state: { monthly_cap: 1_200_000, current_month: 3 } },
      });
      const req = {};
      const res = mockRes();
      await marketController.getMonthlyEmissions(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.months).toHaveLength(12);
      expect(body.months[0]).toEqual({ month: 1, supply: 1.2, has_emitted: true });
      expect(body.months[2]).toEqual({ month: 3, supply: 1.2, has_emitted: true });
      expect(body.months[3]).toEqual({ month: 4, supply: 1.2, has_emitted: false });
    });

    test('502s when the chain response has no emission_state', async () => {
      axios.get.mockResolvedValue({ data: {} });
      const req = {};
      const res = mockRes();
      await marketController.getMonthlyEmissions(req, res);
      expect(res.status).toHaveBeenCalledWith(502);
    });

    test('502s when the chain REST call fails', async () => {
      axios.get.mockRejectedValue(new Error('econnrefused'));
      const req = {};
      const res = mockRes();
      await marketController.getMonthlyEmissions(req, res);
      expect(res.status).toHaveBeenCalledWith(502);
    });
  });

  describe('getMonthlyBreakdown', () => {
    test('classifies trades/mints into bought/conversion/awarded/other without double-counting buys', async () => {
      const marchTs = new Date('2026-03-15T00:00:00Z').getTime();
      axios.get.mockImplementation((url) => {
        if (url.includes('/market/trades')) {
          return Promise.resolve({
            data: { trades: [{ trade_type: 'buy', timestamp: marchTs, mlcn_amount: 5_000_000 }] },
          });
        }
        if (url.includes('/transactions')) {
          return Promise.resolve({
            data: {
              transactions: [
                { tx_type: 'mint', timestamp: marchTs, amount: 8_000_000, memo: 'buy conversion' },
                { tx_type: 'mint', timestamp: marchTs, amount: 3_000_000, memo: 'reward payout' },
              ],
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const req = {};
      const res = mockRes();
      await marketController.getMonthlyBreakdown(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.months).toEqual([
        {
          month: '2026-03',
          bought: 5,
          minted_conversion: 8,
          awarded: 3,
          other: 0, // mintedExclBuys(6) - conversion(8) - awarded(3) is negative, clipped to 0
          total: 16,
          pct_bought: 31.25,
          pct_minted_conversion: 50,
          pct_awarded: 18.75,
          pct_other: 0,
        },
      ]);
    });

    test('synthesizes a 12-month view from the on-chain monthly cap when there is no trade/tx history', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/market/trades')) return Promise.resolve({ data: { trades: [] } });
        if (url.includes('/transactions')) return Promise.resolve({ data: { transactions: [] } });
        if (url.includes('/emission_state')) return Promise.resolve({ data: { emission_state: { monthly_cap: 1_000_000 } } });
        return Promise.resolve({ data: {} });
      });

      const req = {};
      const res = mockRes();
      await marketController.getMonthlyBreakdown(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.months).toHaveLength(12);
      expect(body.months[11]).toEqual(
        expect.objectContaining({ total: 1, bought: 0, minted_conversion: 0, awarded: 0, other: 1 })
      );
    });

    test('degrades gracefully to an empty months array when the chain has no data at all', async () => {
      axios.get.mockRejectedValue(new Error('econnrefused'));
      const prevHome = process.env.MARKETPLACED_HOME;
      process.env.MARKETPLACED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mallchain-empty-'));

      try {
        const req = {};
        const res = mockRes();
        await marketController.getMonthlyBreakdown(req, res);

        expect(res.status).not.toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ months: [] }));
      } finally {
        process.env.MARKETPLACED_HOME = prevHome;
      }
    });
  });
});
