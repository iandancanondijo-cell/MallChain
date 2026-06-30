/// <reference types="vite/client" />

/**
 * @mallchain/shared-config
 *
 * Single source of truth for runtime URLs and chain parameters.
 * Import this from any frontend (React, Vue, vanilla) or backend worker.
 */

// ---------------------------------------------------------------------------
// Type declarations for Vite / Node env vars
// ---------------------------------------------------------------------------
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_WALLET_SERVICE_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_REST?: string;
  readonly VITE_CHAIN_RPC?: string;
  readonly VITE_CHAIN_PREFIX?: string;
  readonly VITE_CHAIN_BASE_DENOM?: string;
  readonly VITE_CHAIN_DISPLAY_DENOM?: string;
  readonly VITE_CHAIN_DECIMALS?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_NETWORK_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function env(key: keyof ImportMetaEnv, fallback: string): string {
  const meta = (typeof globalThis !== 'undefined' && (globalThis as any).importMeta?.env)
    || (typeof import.meta !== 'undefined' && import.meta.env)
    || {};
  return (meta[key] as string | undefined) || fallback;
}

// ---------------------------------------------------------------------------
// Config values
// ---------------------------------------------------------------------------
export const API_URL = env('VITE_API_URL', 'http://localhost:4000/api');
export const API_BASE = env('VITE_API_BASE', API_URL.replace(/\/api\/?$/, ''));
export const WS_URL = env('VITE_WS_URL', API_BASE.replace(/^http/, 'ws'));
export const WALLET_SERVICE_URL = env('VITE_WALLET_SERVICE_URL', 'http://localhost:4001');

export const CHAIN_ID = env('VITE_CHAIN_ID', 'mallchain-1');
export const CHAIN_REST = env('VITE_CHAIN_REST', 'http://localhost:1317');
export const CHAIN_RPC = env('VITE_CHAIN_RPC', 'http://localhost:26657');
export const CHAIN_PREFIX = env('VITE_CHAIN_PREFIX', 'mall');
export const BASE_DENOM = env('VITE_CHAIN_BASE_DENOM', 'stake');
export const DISPLAY_DENOM = env('VITE_CHAIN_DISPLAY_DENOM', 'MAL');
export const CHAIN_DECIMALS = Number(env('VITE_CHAIN_DECIMALS', '6'));

export const APP_NAME = env('VITE_APP_NAME', 'Mallchain');
export const NETWORK_LABEL = env('VITE_NETWORK_LABEL', 'Mallchain');

// ---------------------------------------------------------------------------
// Exported config object
// ---------------------------------------------------------------------------
export interface AppConfig {
  apiUrl: string;
  apiBase: string;
  wsUrl: string;
  walletServiceUrl: string;
  chain: {
    id: string;
    rest: string;
    rpc: string;
    prefix: string;
    baseDenom: string;
    displayDenom: string;
    decimals: number;
  };
  name: string;
  networkLabel: string;
}

export const appConfig: AppConfig = {
  apiUrl: API_URL,
  apiBase: API_BASE,
  wsUrl: WS_URL,
  walletServiceUrl: WALLET_SERVICE_URL,
  chain: {
    id: CHAIN_ID,
    rest: CHAIN_REST,
    rpc: CHAIN_RPC,
    prefix: CHAIN_PREFIX,
    baseDenom: BASE_DENOM,
    displayDenom: DISPLAY_DENOM,
    decimals: CHAIN_DECIMALS,
  },
  name: APP_NAME,
  networkLabel: NETWORK_LABEL,
};

export function toBaseUnits(amount: number | string): string {
  const factor = 10 ** appConfig.chain.decimals;
  return Math.floor(Number(amount) * factor).toString();
}

export function fromBaseUnits(amount: number | string): number {
  const factor = 10 ** appConfig.chain.decimals;
  return Number(amount) / factor;
}
