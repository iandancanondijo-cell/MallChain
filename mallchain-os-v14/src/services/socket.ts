/**
 * Mallchain Mission Control v14 — Socket.IO client manager.
 *
 * Contract: Manages WebSocket connections to the backend Socket.IO server for real-time updates.
 * Provides subscription management for wallet, market, blocks, and price events.
 *
 * Architecture:
 * - Singleton pattern: One global socketManager instance per frontend session
 * - Maintains subscriptions and event listeners across reconnections
 * - Automatic reconnection with exponential backoff for resilience
 * - Room-based isolation: Each wallet address = separate room for data privacy
 * 
 * Features:
 * - Task 5.1: Socket lifecycle management (connect, disconnect, reconnect)
 * - Task 5.2: Connect to backend URL from config.apiBaseUrl (port 4000 by default)
 * - Task 5.3-5.5: Room subscription methods (subscribeWallet, subscribeMarket, subscribePrice, subscribeBlocks)
 * - Task 5.6: Event listeners for wallet updates, blocks, market feeds, prices
 * - Task 5.7: Automatic reconnection with exponential backoff (1s → 30s)
 * - Task 5.8: Re-subscription logic on reconnection
 * - Task 5.9: Cleanup methods for component unmount
 * - Event listener registration/cleanup with cleanup functions
 * - Connection status tracking and subscription management
 * 
 * Real-time data flow:
 * 1. Frontend connects to Socket.IO server at backend
 * 2. User navigates to wallet view
 * 3. Frontend emits 'subscribe:wallet' event to backend
 * 4. Backend adds socket to room 'wallet:address'
 * 5. When blockchain updates wallet balance, backend broadcasts to room
 * 6. Socket receives 'wallet:update' event, triggers listener callbacks
 * 7. Frontend state updates, React rerenders UI with new balance
 * 
 * Reconnection flow:
 * 1. Network connection lost (WiFi off, server restart, etc.)
 * 2. Socket.IO detects disconnection, waits backoff time
 * 3. Socket.IO attempts reconnect, gets new socket.id
 * 4. 'connect' event fires, resubscribeAll() called
 * 5. Frontend re-subscribes to all previous rooms
 * 6. Real-time updates resume
 */

import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { normalizeNotification, type AppNotification } from './notificationWire';

/**
 * Wallet data structure received from socket events
 *
 * Sent by backend when a movement involving this wallet settles, and once as a
 * primer when the socket joins the wallet's room
 * (backend/src/services/walletSync.js):
 * - address: Wallet address that was updated
 * - balances: MLCN balances in display units — 6-decimal MALL, not base units.
 *   `mlcns` is the full on-chain balance, `mlcnsLocked` the part not yet
 *   spendable, `mlcnsAvailable` the difference.
 * - timestamp: When the server read it, unix milliseconds. This is what a
 *   "updated Ns ago" label compares against; a primer can be up to the
 *   server's cache TTL old, which is why the age travels with the payload
 *   instead of the client assuming the number is current.
 */
export interface WalletData {
  address: string;
  /**
   * Named exactly as `toWalletData()` in backend/src/services/walletSync.js
   * builds it — those three keys and nothing else. This used to be
   * `Record<string, number>`, which let hooks/useWalletData.ts read
   * `balances.MALL`/`MLPTS`/`USD_M` (keys no server has ever emitted), apply
   * `|| 0` fallbacks and blank a live balance on every push while still
   * typechecking. Consumers must still guard at runtime: TypeScript describes
   * the contract, it cannot police bytes off a socket.
   */
  balances: {
    mlcns: number;
    mlcnsAvailable: number;
    mlcnsLocked: number;
  };
  timestamp: number;
  denom?: string;
  exists?: boolean;
}

/**
 * Block data structure received from socket events
 *
 * Sent by backend for each new blockchain block (services/blockBroadcaster.js,
 * which subscribes to the node's `tm.event = 'NewBlock'` feed):
 * - height: Block number in chain
 * - hash: Block hash, uppercase hex (the node sends base64; decoded server-side
 *   so it matches what /api/explorer/blocks returns)
 * - timestamp: Block time, ISO 8601 — note this is a *string*, while the
 *   explorer's own BlockData.timestamp is unix seconds
 * - txCount: Number of transactions in block (for UI stats)
 *
 * The optional fields exist so a new block can be painted from the event
 * alone. Before the broadcaster existed, clients received height/hash/time and
 * had to spend a REST round-trip per block for the tx count and proposer —
 * i.e. the "realtime" panel polled. They stay optional because a page can be
 * connected to a backend that predates the broadcaster.
 */
export interface BlockData {
  height: number;
  hash: string;
  timestamp: string;
  txCount: number;
  numTxs?: number;
  proposer?: string;
  unixTime?: number;
  chainId?: string;
  /** 'ws' when the node pushed it, 'rest' when the server's safety-net poll found it. */
  source?: 'ws' | 'rest';
}

/**
 * Market event — one row of marketplace/economy activity.
 *
 * The primer (`market:feed`, an array of these) and the live stream
 * (`market:event`, a single one) carry the same shape. Emitted by
 * backend/src/services/marketActivityFeed.js from the ledger row a settlement
 * wrote and from the catalog document a seller created.
 *
 * A trade is a settled value movement; a listing is a product put up for sale.
 * Deliberately absent: who did it. The room is joined by anonymous sockets, so
 * a row carries amounts, a flow and a time — never a userId, wallet address or
 * fiat amount. `txHash` is on a trade because that movement is already public
 * in the explorer, which lets a viewer verify the row instead of trusting it.
 * 'sale' is not emitted: escrow settlements live on-chain with no local ledger
 * to read, and the feed publishes nothing it cannot substantiate.
 *
 * Note `timestamp` is an ISO string (server clock at record time), unlike
 * WalletData.timestamp which is unix milliseconds — each matches what its
 * emitter actually sends rather than the two being forced to agree on paper.
 */
export type MarketEvent =
  | {
      id: string;
      type: 'trade';
      flow: 'buy' | 'withdraw' | 'mallpoints_purchase' | 'mallpoints_convert' | string;
      amountMlcns: number;
      currency: string;
      timestamp: string;
      txHash: string | null;
    }
  | {
      id: string;
      type: 'listing';
      title: string;
      category: string;
      /** Price in MAL, the native denom x/marketplace escrow holds — not MALL, not fiat. */
      price: number;
      currency: 'MAL';
      timestamp: string;
    };

/**
 * Price data structure
 *
 * Sent when a subscriber joins `price:updates` and again whenever a price
 * actually moves (backend/src/services/priceEngine.js). The numbers are the
 * on-chain market params — the same buy/sell/mid the REST economy state
 * returns, which is why the field names match `economyApi.getState()` instead
 * of inventing a socket-only vocabulary.
 *
 * This replaces a stub that answered every subscription with
 * `{ mallcoin: { usd: 0, kes: 0 }, mlpts: { usd: 0, kes: 2 } }`, i.e. a
 * fabricated quote that had MALL at zero.
 *
 * Honest absence:
 * - `usd` is null when the FX provider is unreachable, rather than a dollar
 *   price derived from a stale constant.
 * - `volume24h` is null when the ledger read failed — not zero, which would
 *   claim nobody traded.
 * - `change24h` is null until the server has two samples inside the window,
 *   which for a freshly started backend means "unknown", not "flat".
 * - `source` distinguishes a chain read from the configured fallback, so a
 *   frozen-looking panel can be told apart from a quiet market.
 */
export interface PriceData {
  buyPriceKes: number;
  sellPriceKes: number;
  midPriceKes: number;
  mlptsPriceKes: number;
  usd: {
    rate: number;
    fxAsOf: string | null;
    midPriceUsd: number | null;
    mlptsPriceUsd: number | null;
  } | null;
  volume24h: { mlcns: number; kes: number; trades: number } | null;
  change24h: number | null;
  source: 'chain' | 'configured-default';
  asOf: string;
}

/**
 * A live-pushed notification, as this client exposes it.
 *
 * Aliased to the shape the REST list returns (see notificationWire.ts) so a
 * socket row and a fetched row are the same thing downstream. The server sends
 * `{type, message}`; normalizing here is what stops every real-time
 * notification from arriving with `kind`/`body` undefined, which is what the
 * bell panel used to do.
 */
export type NotificationData = AppNotification;

/** A live-pushed chat message (see backend/src/routes/messaging.js). */
export interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  ts: string;
}

/**
 * Which origin the websocket handshake should be opened against.
 *
 * The failure this exists for is deployment-shaped and invisible in
 * development: a bundle built with `VITE_API_BASE_URL=http://api.example.com`
 * and served from `https://app.example.com` asks for `ws://api.example.com`,
 * which every browser refuses from a secure page (mixed content) — so realtime
 * silently never connects while REST works fine, because `fetch` upgrades
 * `http:` to the page's scheme more forgivingly than Socket.IO does. Upgrading
 * the scheme here is the client half of the fix; the other half is the proxy
 * answering `wss://` on `/socket.io` (see docs/user-guides/10 and the
 * deployment notes in docs/).
 *
 * Left alone when the page itself is insecure: `http://localhost` is the normal
 * development case and must keep hitting the plain-HTTP backend.
 */
export function resolveSocketOrigin(url?: string): string {
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const chosen = url || config.apiBaseUrl || pageOrigin;
  if (!chosen) return '';
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return chosen;
  return chosen.replace(/^http:\/\//i, 'https://');
}

/**
 * SocketManager handles all Socket.IO client operations
 * 
 * Core responsibilities:
 * - Establish and maintain WebSocket connection to backend
 * - Subscribe/unsubscribe from event rooms
 * - Register event listeners with cleanup functions
 * - Auto-reconnect with exponential backoff
 * - Track subscriptions across reconnections
 */
class SocketManager {
  // Socket.IO client instance (null if not connected or not initialized)
  public socket: Socket | null = null;
  
  // Set of active subscriptions (e.g., "wallet:mall1abc...", "market:feed")
  // Used to re-subscribe after reconnection
  private subscriptions = new Set<string>();

  // The logged-in user's id, remembered independently of connection state.
  // subscribeUser() used to no-op entirely (and never record anything) when
  // called before the socket finished connecting — on a normal page load
  // the auth fetch and the websocket handshake race, so this silently and
  // permanently skipped real-time notification delivery for that session
  // (confirmed live: socket showed "Connected" but 0 subscriptions).
  // Recording the intent here lets the 'connect' handler self-heal it.
  private pendingUserId: string | null = null;
  
  // Map of event name → array of listener callbacks
  // Allows multiple listeners for same event, cleanup functions return unsubscribe
  private eventListeners = new Map<string, ((data: unknown) => void)[]>();
  
  // Reconnection exponential backoff state
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000; // 30 seconds max between attempts
  private baseReconnectDelay = 1000; // 1 second initial delay
  private reconnectMultiplier = 2; // Double delay each attempt (1s, 2s, 4s, 8s, ...)
  
  // Flag to prevent multiple concurrent connection attempts
  private isConnecting = false;

  /**
   * Task 5.2: Connect to backend Socket.IO server.
   *
   * Resolution order: explicit URL → configured API origin → the origin this
   * page is served from. That last fallback is what makes realtime work
   * locally: `VITE_API_BASE_URL` is deliberately unset during development (API
   * calls ride Vite's same-origin `/api` proxy), and this call used to bail out
   * instead — so the socket never connected at all and the header stayed
   * "Disconnected" no matter what the backend was doing. Vite proxies
   * `/socket.io` with `ws: true` for exactly this path.
   *
   * `options.forceNew` asks the client for a brand-new connection instead of
   * one from its per-origin pool; see reauth() for why that matters.
   */
  connect(url?: string, options?: { forceNew?: boolean }): void {
    const socketUrl = resolveSocketOrigin(url);

    if (!socketUrl) {
      console.warn('[Socket] No API origin available — skipping Socket.IO connection');
      return;
    }
    
    if (this.socket?.connected) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionDelay: this.baseReconnectDelay,
        reconnectionDelayMax: this.maxReconnectDelay,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
        // The auth JWT lives in an httpOnly `auth_token` cookie now, not
        // somewhere readable by this code — `withCredentials` makes the
        // Socket.IO handshake (a plain HTTP request) send it the same way
        // `fetch(..., {credentials:'include'})` does, and the backend's
        // io.use() middleware reads it straight off that cookie.
        withCredentials: true,
        ...(options?.forceNew ? { forceNew: true } : {}),
      });

      // Task 5.1: Socket lifecycle management - connection
      this.socket.on('connect', () => {
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        this.emit('system', { message: 'Connected to real-time updates' });
        
        // Task 5.8: Re-subscribe to all rooms on reconnection
        this.resubscribeAll();
        // Re-apply the last-requested user subscription too — resubscribeAll()
        // only replays rooms that were already recorded in `subscriptions`,
        // which never happens for a subscribeUser() call that arrived before
        // this connection existed (see pendingUserId's comment above).
        if (this.pendingUserId) this.subscribeUser(this.pendingUserId);
      });

      // Task 5.1: Socket lifecycle management - disconnection
      this.socket.on('disconnect', (reason) => {
        this.emit('system', { message: 'Real-time updates unavailable', reason });
      });

      // Task 5.7: Handle connection errors with exponential backoff
      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error.message);
        this.isConnecting = false;
      });

      // Register event listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('[Socket] Failed to initialize Socket.IO client:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Setup all Socket.IO event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Task 5.6: Wallet update events
    this.socket.on('wallet:update', (data: WalletData) => {
      this.emit('wallet:update', data);
    });

    // Task 5.6: Block events
    this.socket.on('block:new', (data: BlockData) => {
      this.emit('block:new', data);
    });

    // Task 5.6: Market feed events — the backlog primer, sent on join.
    this.socket.on('market:feed', (events: MarketEvent[]) => {
      this.emit('market:feed', events);
    });

    // One row that just happened, published by the backend as the ledger write
    // or the catalog create lands. Kept a separate event from `market:feed` so
    // a listener can tell a backlog page from live activity instead of having
    // to diff arrays.
    this.socket.on('market:event', (event: MarketEvent) => {
      this.emit('market:event', event);
    });

    // Task 5.6: Price update events
    this.socket.on('price:current', (data: PriceData) => {
      this.emit('price:current', data);
    });

    // System events
    this.socket.on('system', (data: { message: string; timestamp?: number }) => {
      this.emit('system', data);
    });

    // Live notification push (see backend/src/services/notificationEngine.js).
    // The payload is the server's wire shape — `{type, message}` — not this
    // client's `{kind, body}`, so it is normalized at the boundary.
    this.socket.on('notification', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const notification = normalizeNotification(raw as Record<string, unknown>);
      // A row with no id cannot be deduped against the REST page, marked read
      // or archived, so passing it along would put an unactionable item in the
      // feed. The next GET /api/notifications still shows it.
      if (!notification._id) return;
      this.emit('notification', notification);
    });

    // Live chat message push (see backend routes/messaging.js)
    this.socket.on('message:new', (data: MessageData) => {
      this.emit('message:new', data);
    });
  }

  /**
   * Room subscriptions follow "record intent, emit when connected": the room
   * is always recorded in `subscriptions`, but the emit only fires when the
   * socket is up. Components routinely call these right after connect(),
   * while the handshake is still in flight — silently dropping the intent
   * then meant the room was never joined AND resubscribeAll() replayed an
   * empty set after every reconnect (observed live: "Re-subscribing to
   * 0 rooms" with the blocks panel frozen for the whole session).
   */
  /** Subscribe to live messages for a specific conversation. */
  subscribeConversation(conversationId: string): void {
    if (!conversationId) return;
    const room = `conversation:${conversationId}`;
    if (this.subscriptions.has(room)) return;
    this.subscriptions.add(room);
    if (this.socket?.connected) this.socket.emit('subscribe:conversation', conversationId);
  }

  unsubscribeConversation(conversationId: string): void {
    if (!conversationId) return;
    const room = `conversation:${conversationId}`;
    if (!this.subscriptions.delete(room)) return;
    if (this.socket?.connected) this.socket.emit('unsubscribe:conversation', conversationId);
  }

  /** Register a live-message listener. */
  onMessage(callback: (data: MessageData) => void): () => void {
    return this.on('message:new', callback);
  }

  /**
   * Subscribe to live notifications for a specific (Mongo) user id. Safe to
   * call before the socket has finished connecting — the intent is always
   * recorded, and the 'connect' handler retries it once actually connected.
   */
  subscribeUser(userId: string): void {
    if (!userId) return;
    this.pendingUserId = userId;
    if (!this.socket?.connected) return;
    const room = `user:${userId}`;
    if (this.subscriptions.has(room)) return;
    this.socket.emit('subscribe:user', userId);
    this.subscriptions.add(room);
  }

  unsubscribeUser(userId: string): void {
    if (this.pendingUserId === userId) this.pendingUserId = null;
    if (!this.socket?.connected || !userId) return;
    const room = `user:${userId}`;
    if (!this.subscriptions.has(room)) return;
    this.socket.emit('unsubscribe:user', userId);
    this.subscriptions.delete(room);
  }

  /** Register a live-notification listener. */
  onNotification(callback: (data: NotificationData) => void): () => void {
    return this.on('notification', callback);
  }

  /**
   * Task 5.3: Subscribe to wallet updates for a specific address
   * Emits 'subscribe:wallet' event and joins 'wallet:address' room
   */
  subscribeWallet(address: string): void {
    if (!address) {
      console.error('[Socket] Cannot subscribe to wallet - no address provided');
      return;
    }

    const room = `wallet:${address}`;
    if (this.subscriptions.has(room)) {
      return;
    }

    this.subscriptions.add(room);
    if (this.socket?.connected) this.socket.emit('subscribe:wallet', address);
  }

  /**
   * Task 5.4: Unsubscribe from wallet updates for a specific address
   */
  unsubscribeWallet(address: string): void {
    if (!address) {
      console.error('[Socket] Cannot unsubscribe from wallet - no address provided');
      return;
    }

    const room = `wallet:${address}`;
    if (!this.subscriptions.delete(room)) {
      return;
    }

    if (this.socket?.connected) this.socket.emit('unsubscribe:wallet', address);
  }

  /**
   * Task 5.5: Subscribe to market activity feed
   * Emits 'subscribe:market' event and joins 'market:feed' room
   */
  subscribeMarket(): void {
    const room = 'market:feed';
    if (this.subscriptions.has(room)) {
      return;
    }

    this.subscriptions.add(room);
    if (this.socket?.connected) this.socket.emit('subscribe:market');
  }

  /**
   * Task 5.5: Subscribe to price updates
   * Emits 'subscribe:price' event and joins 'price:updates' room
   */
  subscribePrice(): void {
    const room = 'price:updates';
    if (this.subscriptions.has(room)) {
      return;
    }

    this.subscriptions.add(room);
    if (this.socket?.connected) this.socket.emit('subscribe:price');
  }

  /**
   * Task 5.5: Subscribe to live blocks
   * Emits 'subscribe:blocks' event and joins 'blocks:live' room
   */
  subscribeBlocks(): void {
    const room = 'blocks:live';
    if (this.subscriptions.has(room)) {
      return;
    }

    this.subscriptions.add(room);
    if (this.socket?.connected) this.socket.emit('subscribe:blocks');
  }

  /**
   * Task 5.8: Re-subscribe to all previously subscribed rooms on reconnection
   */
  private resubscribeAll(): void {
    const subscriptions = Array.from(this.subscriptions);

    for (const room of subscriptions) {
      if (room.startsWith('wallet:')) {
        const address = room.replace('wallet:', '');
        // Force emit without checking if already subscribed
        this.socket?.emit('subscribe:wallet', address);
      } else if (room.startsWith('user:')) {
        this.socket?.emit('subscribe:user', room.replace('user:', ''));
      } else if (room.startsWith('conversation:')) {
        this.socket?.emit('subscribe:conversation', room.replace('conversation:', ''));
      } else if (room === 'market:feed') {
        this.socket?.emit('subscribe:market');
      } else if (room === 'price:updates') {
        this.socket?.emit('subscribe:price');
      } else if (room === 'blocks:live') {
        this.socket?.emit('subscribe:blocks');
      }
    }
  }

  /**
   * Register event listener for a specific event
   * Returns cleanup function to remove listener
   */
  on<T = unknown>(event: string, callback: (data: T) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback as (data: unknown) => void);

    // Return cleanup function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback as (data: unknown) => void);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Task 5.6: Register wallet update listener
   */
  onWalletUpdate(callback: (data: WalletData) => void): () => void {
    return this.on('wallet:update', callback);
  }

  /**
   * Task 5.6: Register block update listener
   */
  onBlockUpdate(callback: (data: BlockData) => void): () => void {
    return this.on('block:new', callback);
  }

  /**
   * Task 5.6: Register market feed listener (the backlog primer).
   */
  onMarketFeed(callback: (events: MarketEvent[]) => void): () => void {
    return this.on('market:feed', callback);
  }

  /** Register a listener for one row of live market activity. */
  onMarketEvent(callback: (event: MarketEvent) => void): () => void {
    return this.on('market:event', callback);
  }

  /**
   * Task 5.6: Register price update listener
   */
  onPriceUpdate(callback: (data: PriceData) => void): () => void {
    return this.on('price:current', callback);
  }

  /**
   * Internal method to emit events to registered listeners
   */
  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Socket] Error in event listener for '${event}':`, error);
        }
      });
    }
  }

  /**
   * Task 5.9: Cleanup - disconnect socket and remove all listeners
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.subscriptions.clear();
    this.eventListeners.clear();
    this.isConnecting = false;
    this.reconnectAttempt = 0;
  }

  /**
   * Forces a fresh connection so the backend's io.use() JWT middleware picks
   * up a session that didn't exist yet at the original connect() call — the
   * common case of logging in without a page reload, where the socket already
   * connected anonymously first. Deliberately doesn't go through disconnect()
   * (which clears `subscriptions`) — the 'connect' handler's
   * resubscribeAll()/pendingUserId replay needs that bookkeeping intact to
   * restore whatever rooms were joined before.
   *
   * The old connection is destroyed rather than merely disconnected, and the
   * new one is opened with `forceNew`, because the client pools one Manager
   * per origin and hands back that Manager's cached namespace socket: a plain
   * `disconnect()` + `connect()` pair could return the same Socket riding the
   * same pre-login handshake. Confirmed live — after signing in,
   * `subscribe:wallet` still travelled on the connection opened before login,
   * the backend rejected it as unauthenticated, and the wallet showed no live
   * balance until the page was reloaded. A new handshake is the only moment
   * the server can read the auth cookie (or stop reading it, on logout), which
   * is also what drops the previous account's rooms on a shared device.
   */
  reauth(): void {
    const previous = this.socket;
    this.socket = null;
    this.isConnecting = false;
    if (previous) {
      // Our own lifecycle handlers go first, so tearing this connection down
      // doesn't surface as a spurious "Real-time updates unavailable".
      previous.removeAllListeners?.();
      previous.disconnect();
      (previous as unknown as { client?: { destroy?: () => void } }).client?.destroy?.();
    }
    this.connect(undefined, { forceNew: true });
  }

  /**
   * Get current connection status
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get list of current subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

/**
 * Global singleton instance of SocketManager
 */
export const socketManager = new SocketManager();
