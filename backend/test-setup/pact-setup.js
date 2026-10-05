/**
 * Pact Contract Testing Setup
 * Enables contract-driven development for API consumers and providers
 * 
 * Usage:
 * npm test -- --testPathPattern=pact
 */

const { Pact } = require('@pact-foundation/pact');
const path = require('path');

// Create Pact instance
const provider = new Pact({
  consumer: 'mallchain-frontend',
  provider: 'mallchain-backend',
  port: 8080,
  logLevel: 'INFO',
  dir: path.join(__dirname, '../pacts'),
  specification: 'v2',
  cors: true,
});

module.exports = {
  provider,
  port: 8080,

  /**
   * Get base URL for Pact mock server
   */
  getBaseUrl: () => `http://localhost:${provider.opts.port}`,

  /**
   * Add interaction (request/response contract)
   */
  addInteraction: async (interaction) => {
    await provider.addInteraction(interaction);
  },

  /**
   * Verify interactions
   */
  verifyInteractions: async () => {
    return provider.verify();
  },

  /**
   * Finalize pacts
   */
  finalize: async () => {
    return provider.finalize();
  },

  /**
   * Start Pact server
   */
  startServer: async () => {
    return provider.listen();
  },

  /**
   * Stop Pact server
   */
  stopServer: async () => {
    return provider.removeInteractions();
  },

  /**
   * Create interaction builder
   */
  interaction: () => ({
    given: (state) => {
      const obj = { state };
      obj.uponReceiving = (description) => {
        obj.description = description;
        return obj;
      };
      obj.withRequest = (method, path, requestOptions = {}) => {
        obj.request = {
          method,
          path,
          ...requestOptions,
        };
        return obj;
      };
      obj.willRespondWith = (statusCode, responseOptions = {}) => {
        obj.response = {
          status: statusCode,
          ...responseOptions,
        };
        return obj;
      };
      obj.build = () => {
        return {
          state: obj.state,
          uponReceiving: obj.description,
          withRequest: obj.request,
          willRespondWith: obj.response,
        };
      };
      return obj;
    },
  }),

  /**
   * Example contracts
   */
  exampleContracts: {
    // User authentication
    loginSuccess: {
      given: 'user with valid credentials exists',
      uponReceiving: 'a request to login',
      withRequest: {
        method: 'POST',
        path: '/api/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: {
          email: 'test@example.com',
          password: 'password123',
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          token: 'jwt-token',
          user: {
            id: 'user123',
            email: 'test@example.com',
          },
        },
      },
    },

    // Get user profile
    getProfile: {
      given: 'authenticated user',
      uponReceiving: 'a request to get profile',
      withRequest: {
        method: 'GET',
        path: '/api/user/profile',
        headers: {
          Authorization: 'Bearer jwt-token',
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: 'user123',
          email: 'test@example.com',
          profile: {
            firstName: 'Test',
            lastName: 'User',
          },
        },
      },
    },

    // List wallets
    listWallets: {
      given: 'authenticated user with wallets',
      uponReceiving: 'a request to list wallets',
      withRequest: {
        method: 'GET',
        path: '/api/wallets',
        headers: {
          Authorization: 'Bearer jwt-token',
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          wallets: [
            {
              id: 'wallet1',
              address: 'cosmos1...',
              balance: '1000',
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 10,
          },
        },
      },
    },

    // Market products
    listProducts: {
      given: 'products exist in marketplace',
      uponReceiving: 'a request to list market products',
      withRequest: {
        method: 'GET',
        path: '/api/market/products',
        query: { page: '1', limit: '10' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          products: [
            {
              id: 'product1',
              name: 'Product 1',
              price: '100',
              seller: {
                id: 'seller1',
                name: 'Seller Name',
              },
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 10,
          },
        },
      },
    },

    // Error case: unauthorized
    unauthorizedError: {
      given: 'no authentication provided',
      uponReceiving: 'a request without auth token',
      withRequest: {
        method: 'GET',
        path: '/api/user/profile',
      },
      willRespondWith: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'unauthorized',
          message: 'Authentication required',
        },
      },
    },
  },
};
