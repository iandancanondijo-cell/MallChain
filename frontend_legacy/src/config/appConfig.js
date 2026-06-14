/**
 * Application Configuration
 * Controls which modules are active and how they communicate
 * 
 * Environment Variables:
 * VITE_APP_MODE: 'wallet' | 'ecommerce' | 'full' (default)
 * VITE_ENABLE_WALLET: true/false (default: true)
 * VITE_ENABLE_ECOMMERCE: true/false (default: true)
 * VITE_WALLET_API_URL: URL for wallet service (if separate)
 * VITE_ECOMMERCE_API_URL: URL for e-commerce service (if separate)
 */

export const appConfig = {
  // Application Mode
  mode: import.meta.env.VITE_APP_MODE || 'full', // 'wallet' | 'ecommerce' | 'full'

  // Feature Flags
  features: {
    wallet: import.meta.env.VITE_ENABLE_WALLET !== 'false',
    ecommerce: import.meta.env.VITE_ENABLE_ECOMMERCE !== 'false',
    chat: import.meta.env.VITE_ENABLE_CHAT === 'true',
    admin: import.meta.env.VITE_ENABLE_ADMIN === 'true',
  },

  // API Endpoints
  api: {
    walletBaseUrl: import.meta.env.VITE_WALLET_API_URL || '/api/wallet',
    ecommerceBaseUrl: import.meta.env.VITE_ECOMMERCE_API_URL || '/api/ecommerce',
    authBaseUrl: import.meta.env.VITE_AUTH_API_URL || '/api/auth',
  },

  // Cross-Module Settings
  crossModule: {
    // Allow e-commerce to access wallet balance
    allowWalletIntegration: import.meta.env.VITE_CROSS_MODULE_WALLET === 'true',
    // Automatically sync wallet balance to e-commerce profile
    autoSyncBalance: import.meta.env.VITE_AUTO_SYNC_BALANCE === 'true',
    // Check for wallet connection before e-commerce checkout
    requireWalletForCheckout: import.meta.env.VITE_REQUIRE_WALLET_CHECKOUT === 'true',
  },

  // UI Configuration
  ui: {
    showWalletWidget: import.meta.env.VITE_SHOW_WALLET_WIDGET === 'true',
    walletWidgetPosition: 'top-right', // 'top-right' | 'bottom-right'
  },
};

/**
 * Check if specific module is enabled
 */
export function isModuleEnabled(module) {
  return appConfig.features[module] === true;
}

/**
 * Check if we're in specific mode
 */
export function isAppMode(mode) {
  return appConfig.mode === mode;
}

/**
 * Get API endpoint for module
 */
export function getApiEndpoint(module) {
  return appConfig.api[`${module}BaseUrl`];
}

/**
 * Validate mode compatibility
 */
export function getModeMiddleware() {
  return (req, res, next) => {
    req.appConfig = appConfig;
    req.isModule = (module) => isModuleEnabled(module);
    next();
  };
}
