/**
 * Frontend runtime configuration (Vite env).
 */

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const apiBase = import.meta.env.VITE_API_BASE || apiUrl.replace(/\/api\/?$/, '');

export const appConfig = {
  name: import.meta.env.VITE_APP_NAME || 'Mallcoin',
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  networkLabel: import.meta.env.VITE_NETWORK_LABEL || 'Mallchain',

  apiUrl,
  apiBase,
  walletServiceUrl:
    import.meta.env.VITE_WALLET_SERVICE_URL || 'http://localhost:4001',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:4000',

  chain: {
    id: import.meta.env.VITE_CHAIN_ID || 'mallchain-1',
    rest: import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317',
    rpc: import.meta.env.VITE_CHAIN_RPC || 'http://localhost:26657',
    prefix: import.meta.env.VITE_CHAIN_PREFIX || 'mall',
    baseDenom: import.meta.env.VITE_CHAIN_BASE_DENOM || 'stake',
    displayDenom: import.meta.env.VITE_CHAIN_DISPLAY_DENOM || 'MAL',
    decimals: Number(import.meta.env.VITE_CHAIN_DECIMALS || 6),
  },
};

export function toBaseUnits(amount) {
  const factor = 10 ** appConfig.chain.decimals;
  return Math.floor(Number(amount) * factor).toString();
}

export function fromBaseUnits(amount) {
  const factor = 10 ** appConfig.chain.decimals;
  return Number(amount) / factor;
}
