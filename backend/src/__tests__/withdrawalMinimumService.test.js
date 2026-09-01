const { checkMinimumWithdrawal, MIN_WITHDRAWAL_KES } = require('../services/withdrawalMinimumService');

describe('withdrawalMinimumService.checkMinimumWithdrawal', () => {
  test('defaults the minimum to KES 350', () => {
    expect(MIN_WITHDRAWAL_KES).toBe(350);
  });

  test('passes at exactly the minimum', () => {
    const result = checkMinimumWithdrawal(350);
    expect(result.ok).toBe(true);
    expect(result.shortfallKes).toBeNull();
  });

  test('passes above the minimum', () => {
    const result = checkMinimumWithdrawal(1000);
    expect(result.ok).toBe(true);
  });

  test('fails below the minimum and reports the exact shortfall', () => {
    const result = checkMinimumWithdrawal(200);
    expect(result.ok).toBe(false);
    expect(result.minimumKes).toBe(350);
    expect(result.shortfallKes).toBe(150);
  });

  test('fails at zero', () => {
    const result = checkMinimumWithdrawal(0);
    expect(result.ok).toBe(false);
    expect(result.shortfallKes).toBe(350);
  });
});
