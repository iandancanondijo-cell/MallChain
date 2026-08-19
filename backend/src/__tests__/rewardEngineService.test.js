const {
  resolveBaseRate,
  clampMultiplier,
  computeCampaignRate,
  MIN_CAMPAIGN_MULTIPLIER,
  MAX_CAMPAIGN_MULTIPLIER,
} = require('../services/rewardEngineService');

describe('rewardEngineService', () => {
  test('resolveBaseRate reads a flat-rate activity', () => {
    expect(resolveBaseRate('tiktok', 'like')).toBe(0.10);
    expect(resolveBaseRate('x', 'repost')).toBe(17);
  });

  test('resolveBaseRate returns the midpoint for a ranged activity', () => {
    expect(resolveBaseRate('tiktok', 'complete_campaign')).toBe(3); // (1+5)/2
  });

  test('resolveBaseRate returns null for unknown platform/activity', () => {
    expect(resolveBaseRate('myspace', 'poke')).toBeNull();
    expect(resolveBaseRate('tiktok', 'poke')).toBeNull();
  });

  test('clampMultiplier bounds to [0.5, 5]', () => {
    expect(clampMultiplier(0.1)).toBe(MIN_CAMPAIGN_MULTIPLIER);
    expect(clampMultiplier(50)).toBe(MAX_CAMPAIGN_MULTIPLIER);
    expect(clampMultiplier(2)).toBe(2);
    expect(clampMultiplier('not a number')).toBe(1);
  });

  test('computeCampaignRate applies Base x Multiplier', () => {
    // Instagram follow = 3 MLPTS base
    expect(computeCampaignRate({ platform: 'instagram', activity: 'follow', multiplier: 2 })).toBe(6);
  });

  test('computeCampaignRate clamps an out-of-range multiplier before applying it', () => {
    // Multiplier 100 clamps to 5x, not 100x — an unrestricted multiplier
    // would be exactly the emission-explosion risk called out for X impressions.
    expect(computeCampaignRate({ platform: 'x', activity: 'impression', multiplier: 100 })).toBe(45); // 9 * 5
  });

  test('computeCampaignRate returns null for an unknown platform/activity pair', () => {
    expect(computeCampaignRate({ platform: 'myspace', activity: 'poke', multiplier: 1 })).toBeNull();
  });
});
