const faucetService = require('../services/faucetService');

// Mock dependencies
jest.mock('../services/blockchainListener');
jest.mock('@cosmjs/proto-signing');
jest.mock('@cosmjs/stargate');

describe('Faucet Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFaucetRequest', () => {
    test('should validate valid faucet request', () => {
      const request = {
        walletAddress: 'mall1testaddress',
        amount: 1000
      };
      
      const result = faucetService.validateFaucetRequest(request);
      expect(result.valid).toBe(true);
    });

    test('should reject request with invalid address', () => {
      const request = {
        walletAddress: 'invalid-address',
        amount: 1000
      };
      
      const result = faucetService.validateFaucetRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid address');
    });

    test('should reject request with zero amount', () => {
      const request = {
        walletAddress: 'mall1testaddress',
        amount: 0
      };
      
      const result = faucetService.validateFaucetRequest(request);
      expect(result.valid).toBe(false);
    });

    test('should reject request exceeding max amount', () => {
      const request = {
        walletAddress: 'mall1testaddress',
        amount: 100000
      };
      
      const result = faucetService.validateFaucetRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('checkCooldown', () => {
    test('should allow request if no previous request', () => {
      const lastRequestTime = null;
      const cooldownMs = 60000;
      
      const canRequest = faucetService.checkCooldown(lastRequestTime, cooldownMs);
      expect(canRequest).toBe(true);
    });

    test('should allow request after cooldown period', () => {
      const lastRequestTime = Date.now() - 70000; // 70 seconds ago
      const cooldownMs = 60000;
      
      const canRequest = faucetService.checkCooldown(lastRequestTime, cooldownMs);
      expect(canRequest).toBe(true);
    });

    test('should reject request within cooldown period', () => {
      const lastRequestTime = Date.now() - 30000; // 30 seconds ago
      const cooldownMs = 60000;
      
      const canRequest = faucetService.checkCooldown(lastRequestTime, cooldownMs);
      expect(canRequest).toBe(false);
    });
  });
});
