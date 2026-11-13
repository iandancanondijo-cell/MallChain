import { api } from './api';
import { chain, config } from './config';

/**
 * The network the node says it is — one poller for the whole app.
 *
 * Three surfaces used to print `config.network` (the VITE_NETWORK build flag,
 * which defaults to 'testnet' when the env var is unset). That is how a
 * dashboard titled "Mallchain Mainnet" ended up with a "testnet" chip next to
 * the user's name: two different answers to the same question, both on screen
 * at once. A build flag describes how the bundle was compiled; it does not
 * describe which chain is producing blocks, and it is the latter people read
 * the label as.
 *
 * Two reads, because they answer different questions and change at different
 * speeds:
 *
 *  - `GET /api/network` (backend/src/controllers/networkIdentityController.js)
 *    is the identity: chain id, the network *name*, bech32 prefix, denom
 *    decimals and the explorer link template. It is the server's decision
 *    what `mallchain-1` is called, so the app displays what it is told rather
 *    than reconstructing the rule locally. Rarely read: a chain does not
 *    rename itself, so it is fetched once and re-fetched only if the node
 *    starts reporting a different chain id.
 *  - `GET /api/blockchain/health` is the live state (height, block time),
 *    polled on the shared interval.
 *
 * The first subscriber starts the interval and everyone else reads the same
 * cached snapshot, rather than each surface adding its own poll to the request
 * budget.
 */

const POLL_MS = 60 * 1000;

interface HealthResponse {
  status?: string;
  chainId?: string;
  moniker?: string;
  latestHeight?: string | number;
  latestBlockTime?: string | null;
}

/** Body of `GET /api/network`. */
export interface ChainIdentityResponse {
  chainId: string | null;
  networkName: string | null;
  bech32Prefix?: string;
  baseDenom?: string;
  displayDenom?: string;
  decimals?: number;
  /** 'chain' when the chain publishes denom metadata, 'configured' when it does not. */
  decimalsSource?: 'chain' | 'configured';
  /** True only when the chain id came from the node rather than server config. */
  verified?: boolean;
  source?: 'node' | 'config';
  explorer?: { base?: string; tx?: string };
  endpoints?: { rest?: string; rpc?: string };
  nodeError?: string | null;
}

export interface NetworkSnapshot {
  chainId: string | null;
  latestHeight: number | null;
  latestBlockTime: string | null;
  /** True while /api/blockchain/health answers with a usable chainId. */
  reachable: boolean;
  /** False when this build points at a different chain than the node reports. */
  matchesConfig: boolean;
  loading: boolean;
  /**
   * The network's display name, as the server named it. Null until
   * /api/network has answered — callers that must show something meanwhile
   * fall back to `nameForChainId`, which is exactly the rule the server
   * applies, kept here only as that fallback.
   */
  networkName: string | null;
  /** True when the server read the chain id from the node itself. */
  identityVerified: boolean | null;
  /** Where the server got the chain id from: the node, or its own config. */
  identitySource: 'node' | 'config' | null;
  /** Denom decimals reported by the chain's own metadata, when it has any. */
  decimals: number | null;
  decimalsSource: 'chain' | 'configured' | null;
  displayDenom: string | null;
  /** Explorer transaction URL template from the server, `{hash}` still to be substituted. */
  explorerTxUrl: string | null;
}

const EMPTY: NetworkSnapshot = {
  chainId: null,
  latestHeight: null,
  latestBlockTime: null,
  reachable: false,
  matchesConfig: true,
  loading: true,
  networkName: null,
  identityVerified: null,
  identitySource: null,
  decimals: null,
  decimalsSource: null,
  displayDenom: null,
  explorerTxUrl: null,
};

/**
 * Fallback naming rule, mirroring the Cosmos convention: the revision number
 * goes last and `-1` is reserved for mainnets, so `mallchain-1` is a mainnet
 * and `mallchain-test-1` is not. Anything these rules don't recognise is
 * displayed verbatim rather than labelled "mainnet" on faith.
 *
 * The authoritative version of this rule lives server-side
 * (`networkNameFromChainId` in networkIdentityController.js) and is what
 * `snapshot.networkName` carries. This copy exists only for the window before
 * /api/network has answered, so a chip can still say something true about a
 * chain id the health poll already reported.
 */
export function nameForChainId(chainId: string): string {
  if (/test|dev|local/i.test(chainId)) return 'Mallchain Testnet';
  if (/^(.*-)?1$/.test(chainId)) return 'Mallchain Mainnet';
  return chainId;
}

let snapshot: NetworkSnapshot = EMPTY;
let timer: number | null = null;
let inFlight: Promise<void> | null = null;
let identityInFlight: Promise<void> | null = null;
/** The chain id the current name was read for, so a chain switch re-reads it. */
let identityChainId: string | null = null;
/** Not-before timestamp: a read that worked is not repeated every poll. */
let identityNotBeforeMs = 0;
const IDENTITY_FRESH_MS = 15 * 60 * 1000;
const IDENTITY_RETRY_MS = 60 * 1000;
const listeners = new Set<(snap: NetworkSnapshot) => void>();

function publish(): void {
  for (const fn of listeners) fn(snapshot);
}

/**
 * Read the network's identity. Kept separate from the health poll because it
 * is not polled: `ensureIdentity` calls it once, then again only when the node
 * reports a chain id that differs from the one the name was read for, or after
 * a failed read stops being back-off.
 */
async function fetchIdentity(): Promise<void> {
  if (identityInFlight) return identityInFlight;
  identityInFlight = (async () => {
    let data: ChainIdentityResponse | null = null;
    try {
      const res = await api.get<ChainIdentityResponse>('/api/network');
      data = res.ok && res.data ? res.data : null;
    } catch {
      data = null;
    }
    // No name is better than an invented one: when this read fails the
    // snapshot keeps `networkName: null` and callers fall back to
    // nameForChainId, while identityVerified stays null so the UI can tell a
    // locally derived label apart from one the node reported.
    snapshot = {
      ...snapshot,
      networkName: data?.networkName ?? null,
      identityVerified: data ? data.verified ?? false : null,
      identitySource: data?.source ?? null,
      decimals: data?.decimals ?? null,
      decimalsSource: data?.decimalsSource ?? null,
      displayDenom: data?.displayDenom ?? null,
      explorerTxUrl: data?.explorer?.tx ?? null,
      // The server's chain id is the same node measurement the health
      // endpoint reports; adopting it keeps the two reads from showing two
      // different chains during a restart.
      chainId: data?.chainId ?? snapshot.chainId,
      loading: false,
    };
    identityChainId = snapshot.chainId;
    identityNotBeforeMs = Date.now() + (data ? IDENTITY_FRESH_MS : IDENTITY_RETRY_MS);
    identityInFlight = null;
    publish();
  })();
  return identityInFlight;
}

/** Fetch the identity when we have never had one, the chain changed, or the last read went stale. */
function ensureIdentity(): Promise<void> | null {
  if (snapshot.chainId === identityChainId && Date.now() < identityNotBeforeMs) return null;
  return fetchIdentity();
}

async function fetchOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await api.get<HealthResponse>('/api/blockchain/health');
      const chainId = res.ok && res.data?.chainId && res.data.chainId !== 'unknown' ? res.data.chainId : null;
      snapshot = {
        ...snapshot,
        chainId,
        latestHeight: chainId ? Number(res.data?.latestHeight ?? 0) || null : null,
        latestBlockTime: chainId ? res.data?.latestBlockTime ?? null : null,
        reachable: Boolean(chainId),
        matchesConfig: chainId === null || chainId === chain.chainId,
        loading: false,
      };
    } catch {
      // Keep the last known good label rather than flipping the UI to
      // "unreachable" on one failed poll; only a first-load failure leaves
      // `loading` behind.
      snapshot = { ...snapshot, reachable: snapshot.chainId !== null ? snapshot.reachable : false, loading: false };
    } finally {
      inFlight = null;
      publish();
      // After the health read settles, because that is when a chain-id change
      // is visible: the identity is only re-read when it no longer describes
      // the chain the node is reporting.
      await ensureIdentity();
    }
  })();
  return inFlight;
}

/** Subscribe to the shared snapshot; the first subscriber starts the poll. */
export function subscribeNetworkIdentity(fn: (snap: NetworkSnapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  if (timer === null) {
    void fetchOnce();
    timer = window.setInterval(() => void fetchOnce(), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
  };
}

/** Force a re-read (the Chain snapshot card's Refresh button). */
export function refreshNetworkIdentity(): Promise<void> {
  return fetchOnce();
}

export function getNetworkSnapshot(): NetworkSnapshot {
  return snapshot;
}

/**
 * The short label for a chip: the name the server gave the chain, or the
 * locally-derived fallback while /api/network has not answered, or the build
 * flag's value only when the node has never answered at all (an offline user
 * still deserves to know which build they are looking at).
 */
export function networkLabel(snap: NetworkSnapshot): string {
  const raw = snap.networkName ?? (snap.chainId ? nameForChainId(snap.chainId) : null);
  if (raw) return raw.replace('Mallchain ', '').toLowerCase();
  if (snap.loading) return 'checking…';
  return config.network;
}

/** Exposed for tests: module state is a singleton, and a suite needs a clean one. */
export function _resetNetworkIdentity(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  inFlight = null;
  identityInFlight = null;
  identityChainId = null;
  identityNotBeforeMs = 0;
  snapshot = EMPTY;
  listeners.clear();
}
