// Regression coverage for the sell-side liquidity gate: a cash-out must not
// be allowed to promise more KES than the MLCN/KES pool actually holds.
jest.mock('../controllers/liquidityController', () => ({
  fetchPoolsFromBlockchain: jest.fn(),
}));
jest.mock('../utils/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));

const liquidityController = require('../controllers/liquidityController');
const { checkSellLiquidity } = require('../services/sellGateService');

describe('sellGateService.checkSellLiquidity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allows a withdrawal within the pool KES reserve', async () => {
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 10000 }]);

    const result = await checkSellLiquidity(5000);

    expect(result.ok).toBe(true);
    expect(result.reserveKes).toBe(10000);
  });

  test('rejects a withdrawal that exceeds the pool KES reserve', async () => {
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 1000 }]);

    const result = await checkSellLiquidity(5000);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Insufficient pool liquidity/);
  });

  test('rejects exactly at the boundary only when the request exceeds available liquidity', async () => {
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([{ id: 2, reserve1: 5000 }]);

    expect((await checkSellLiquidity(5000)).ok).toBe(true); // exactly available
    expect((await checkSellLiquidity(5000.01)).ok).toBe(false); // one cent over
  });

  test('fails closed (blocks the withdrawal) when the pool can not be read', async () => {
    liquidityController.fetchPoolsFromBlockchain.mockRejectedValue(new Error('chain unreachable'));

    const result = await checkSellLiquidity(100);

    expect(result.ok).toBe(false);
    expect(result.reserveKes).toBeNull();
  });

  test('treats a missing pool as zero reserve', async () => {
    liquidityController.fetchPoolsFromBlockchain.mockResolvedValue([]);

    const result = await checkSellLiquidity(1);

    expect(result.ok).toBe(false);
    expect(result.reserveKes).toBe(0);
  });
});
