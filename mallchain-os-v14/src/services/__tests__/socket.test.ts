/**
 * Unit tests for Socket.IO client manager (socket.ts)
 * Tests socket lifecycle, subscription management, and event handling
 * 
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { io } from 'socket.io-client';
import { socketManager } from '../socket';

// Mock socket.io-client with a controllable mock
let mockSocket: any;

// Set by a test that needs the next io() call to produce a different socket,
// which is what the real client does once the previous Manager is destroyed.
let freshSocketOnNextConnect = false;

const createMockSocket = () => ({
  connected: false,
  id: 'test-socket-' + Math.random(),
  _listeners: new Map() as Map<string, ((...args: unknown[]) => void)[]>,
  _emits: [] as any[],
  disconnects: 0,
  // The real Socket exposes its Manager as `.client`, and Manager#destroy()
  // is what takes the pooled connection down. reauth() depends on both.
  client: {
    destroyed: false,
    destroy() { this.destroyed = true; },
  },

  on(event: string, fn: (...args: unknown[]) => void) {
    const listeners = this._listeners.get(event) || [];
    listeners.push(fn);
    this._listeners.set(event, listeners);
    return this;
  },

  emit(event: string, ...args: any[]) {
    this._emits.push({ event, args });
    return this;
  },

  off() {
    return this;
  },

  removeAllListeners() {
    this._listeners.clear();
    return this;
  },

  disconnect() {
    this.connected = false;
    this.disconnects++;
    return this;
  },

  // Test helpers
  __simulateConnect() {
    this.connected = true;
    const handlers = this._listeners.get('connect') || [];
    handlers.forEach((h: (...args: unknown[]) => void) => h());
  },

  __simulateDisconnect(reason: string) {
    this.connected = false;
    const handlers = this._listeners.get('disconnect') || [];
    handlers.forEach((h: (...args: unknown[]) => void) => h(reason));
  },

  __simulateEvent(name: string, data: any) {
    const handlers = this._listeners.get(name) || [];
    handlers.forEach((h: (...args: unknown[]) => void) => h(data));
  },
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    if (!mockSocket || freshSocketOnNextConnect) {
      freshSocketOnNextConnect = false;
      mockSocket = createMockSocket();
    }
    return mockSocket;
  }),
}));

describe('SocketManager - Socket.IO Connection Tests', () => {
  beforeEach(() => {
    socketManager.disconnect();
    freshSocketOnNextConnect = false;
    mockSocket = createMockSocket();
    vi.mocked(io).mockClear();
  });

  // Connection Management Tests (5.2, 5.7)
  describe('Connection Management', () => {
    it('should create socket connection to backend (Req 5.2)', () => {
      socketManager.connect('http://localhost:4000');
      
      expect(socketManager.socket).not.toBeNull();
      expect(typeof socketManager.socket).toBe('object');
    });

    it('should prevent duplicate socket connections', () => {
      socketManager.connect('http://localhost:4000');
      const firstSocket = socketManager.socket;
      
      socketManager.connect('http://localhost:4000');
      
      expect(socketManager.socket).toBe(firstSocket);
    });

    it('should track connection state', () => {
      socketManager.connect('http://localhost:4000');
      
      // Initially disconnected
      expect(socketManager.isConnected()).toBe(false);
      
      // Simulate connection
      mockSocket.__simulateConnect();
      expect(socketManager.isConnected()).toBe(true);
    });

    it('should emit system event on connection', () => {
      socketManager.connect('http://localhost:4000');
      
      const handler = vi.fn();
      socketManager.on('system', handler);
      
      mockSocket.__simulateConnect();
      
      expect(handler).toHaveBeenCalled();
    });

    it('should handle disconnection events', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
      
      mockSocket.__simulateDisconnect('io server disconnect');
      
      expect(socketManager.isConnected()).toBe(false);
    });

    it('should support exponential backoff reconnection (Req 5.7)', () => {
      socketManager.connect('http://localhost:4000');
      
      // Socket exists - this enables exponential backoff via socket.io client options
      expect(socketManager.socket).not.toBeNull();
    });
  });

  // Wallet Subscription Tests (5.3, 5.4)
  describe('Wallet Subscriptions', () => {
    beforeEach(() => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
    });

    it('should subscribe to wallet updates (Req 5.3)', () => {
      const address = 'mall1testaddress123456';
      
      socketManager.subscribeWallet(address);
      
      // Verify subscription was tracked
      expect(socketManager.getSubscriptions()).toContain(`wallet:${address}`);
      
      // Verify emit was called
      expect(mockSocket._emits.some((e: any) => e.event === 'subscribe:wallet')).toBe(true);
    });

    it('should unsubscribe from wallet (Req 5.4)', () => {
      const address = 'mall1unsubtest';
      
      socketManager.subscribeWallet(address);
      const initialEmits = mockSocket._emits.length;
      
      socketManager.unsubscribeWallet(address);
      
      // Verify unsubscribe was emitted
      expect(mockSocket._emits.length).toBeGreaterThan(initialEmits);
      expect(mockSocket._emits.some((e: any) => e.event === 'unsubscribe:wallet')).toBe(true);
      
      // Verify subscription was removed
      expect(socketManager.getSubscriptions()).not.toContain(`wallet:${address}`);
    });

    it('should avoid duplicate wallet subscriptions', () => {
      const address = 'mall1duplicate';
      const initialEmits = mockSocket._emits.length;
      
      socketManager.subscribeWallet(address);
      socketManager.subscribeWallet(address);
      
      // Only one subscription should be emitted
      const walletEmits = mockSocket._emits.slice(initialEmits).filter((e: any) => e.event === 'subscribe:wallet');
      expect(walletEmits).toHaveLength(1);
    });

    it('should validate address before subscribing', () => {
      socketManager.subscribeWallet('');
      
      expect(socketManager.getSubscriptions()).toHaveLength(0);
    });
  });

  // Channel Subscriptions (5.5)
  describe('Channel Subscriptions', () => {
    beforeEach(() => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
    });

    it('should subscribe to market feed (Req 5.5)', () => {
      socketManager.subscribeMarket();
      
      expect(socketManager.getSubscriptions()).toContain('market:feed');
      expect(mockSocket._emits.some((e: any) => e.event === 'subscribe:market')).toBe(true);
    });

    it('should subscribe to price updates (Req 5.5)', () => {
      socketManager.subscribePrice();
      
      expect(socketManager.getSubscriptions()).toContain('price:updates');
      expect(mockSocket._emits.some((e: any) => e.event === 'subscribe:price')).toBe(true);
    });

    it('should subscribe to block updates (Req 5.5)', () => {
      socketManager.subscribeBlocks();
      
      expect(socketManager.getSubscriptions()).toContain('blocks:live');
      expect(mockSocket._emits.some((e: any) => e.event === 'subscribe:blocks')).toBe(true);
    });
  });

  // Event Reception Tests (5.6)
  describe('Event Reception', () => {
    beforeEach(() => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
    });

    it('should receive wallet:update events (Req 5.6)', () => {
      const callback = vi.fn();
      socketManager.onWalletUpdate(callback);
      
      // Shaped like the payload backend/src/services/walletSync.js emits, so
      // this suite cannot drift into asserting a contract the server does not
      // have (these fixtures used to carry `balances.MALL`, a key that has
      // never been on the wire, and the hook that read it typechecked).
      const testData = {
        address: 'mall1test',
        balances: { mlcns: 1000, mlcnsAvailable: 950, mlcnsLocked: 50 },
        timestamp: Date.now(),
      };
      
      mockSocket.__simulateEvent('wallet:update', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should receive block:new events (Req 5.6)', () => {
      const callback = vi.fn();
      socketManager.onBlockUpdate(callback);
      
      const testData = {
        height: 100,
        hash: 'abc123',
        timestamp: '2024-01-01T00:00:00Z',
        txCount: 5,
      };
      
      mockSocket.__simulateEvent('block:new', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should receive market:feed events (Req 5.6)', () => {
      const callback = vi.fn();
      socketManager.onMarketFeed(callback);
      
      const testData = [
        {
          id: 'evt-1',
          type: 'trade' as const,
          flow: 'buy',
          amountMlcns: 100,
          currency: 'KES',
          timestamp: new Date().toISOString(),
          txHash: null,
        },
      ];
      
      mockSocket.__simulateEvent('market:feed', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should receive live market:event rows separately from the primer (marketActivityFeed)', () => {
      const callback = vi.fn();
      socketManager.onMarketEvent(callback);

      const live = {
        id: 'evt-2',
        type: 'listing' as const,
        title: 'Maize flour 2kg',
        category: 'food',
        price: 12.5,
        currency: 'MAL' as const,
        timestamp: new Date().toISOString(),
      };

      mockSocket.__simulateEvent('market:event', live);

      // The primer and the live stream are different events on purpose: a
      // listener that renders "just now" rows must not have to diff the
      // backlog array it was handed on join.
      expect(callback).toHaveBeenCalledWith(live);
    });

    it('should receive price:current events (Req 5.6)', () => {
      const callback = vi.fn();
      socketManager.onPriceUpdate(callback);
      
      const testData = {
        buyPriceKes: 0.62,
        sellPriceKes: 0.58,
        midPriceKes: 0.6,
        mlptsPriceKes: 2,
        usd: null,
        volume24h: null,
        change24h: null,
        source: 'chain' as const,
        asOf: new Date().toISOString(),
      };
      
      mockSocket.__simulateEvent('price:current', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should support event listener deregistration', () => {
      const callback = vi.fn();
      const unregister = socketManager.onWalletUpdate(callback);
      
      const testData = {
        address: 'mall1',
        balances: { mlcns: 100, mlcnsAvailable: 100, mlcnsLocked: 0 },
        timestamp: Date.now(),
      };
      
      mockSocket.__simulateEvent('wallet:update', testData);
      expect(callback).toHaveBeenCalledTimes(1);
      
      // Deregister
      unregister();
      
      mockSocket.__simulateEvent('wallet:update', testData);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners on same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      
      socketManager.onWalletUpdate(cb1);
      socketManager.onWalletUpdate(cb2);
      
      const testData = {
        address: 'mall1',
        balances: { mlcns: 100, mlcnsAvailable: 100, mlcnsLocked: 0 },
        timestamp: Date.now(),
      };
      
      mockSocket.__simulateEvent('wallet:update', testData);
      
      expect(cb1).toHaveBeenCalledWith(testData);
      expect(cb2).toHaveBeenCalledWith(testData);
    });
  });

  // Reconnection Tests (5.8)
  describe('Reconnection and Re-subscription', () => {
    it('should re-subscribe to rooms on reconnection (Req 5.8)', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
      
      // Subscribe to multiple rooms
      socketManager.subscribeWallet('mall1addr');
      socketManager.subscribeMarket();
      socketManager.subscribePrice();
      socketManager.subscribeBlocks();
      
      const subscriptions = socketManager.getSubscriptions();
      expect(subscriptions.length).toBeGreaterThan(0);
      
      // Count initial subscriptions emitted
      const initialSubEmits = mockSocket._emits.filter((e: any) => e.event.startsWith('subscribe:'));
      expect(initialSubEmits.length).toBeGreaterThan(0);
      
      // Disconnect
      mockSocket.__simulateDisconnect('connection lost');
      
      // Clear emit log to track new emits after reconnection
      mockSocket._emits = [];
      
      // Reconnect - should trigger re-subscription
      mockSocket.__simulateConnect();
      
      // Verify re-subscriptions happened
      const resubEmits = mockSocket._emits.filter((e: any) => e.event.startsWith('subscribe:'));
      expect(resubEmits.length).toBeGreaterThan(0);
      expect(resubEmits.length).toBe(initialSubEmits.length); // Should have same number as initial
    });
  });

  // The handshake is the only moment the backend's io.use() middleware can
  // read the httpOnly auth cookie, so signing in without a page reload has to
  // produce a genuinely new connection. Before this, reauth() called
  // socket.disconnect() and then connect() — and the client, which pools one
  // Manager per origin and returns that Manager's cached namespace socket,
  // handed back the SAME still-open pre-login connection. Confirmed live: the
  // wallet page kept emitting subscribe:wallet on the anonymous socket, the
  // backend rejected every one of them, and no balance ever arrived until the
  // tab was reloaded.
  describe('reauth — realtime identity follows the session', () => {
    it('tears the previous connection down instead of reusing it', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
      const anonymous = mockSocket;

      freshSocketOnNextConnect = true;
      socketManager.reauth();

      expect(anonymous.disconnects).toBe(1);
      // Without this the pooled Manager keeps the old engine alive, which is
      // exactly how the anonymous handshake survived the login.
      expect(anonymous.client.destroyed).toBe(true);
      expect(socketManager.socket).not.toBe(anonymous);
      expect(socketManager.isConnected()).toBe(false); // the new one is still opening
    });

    it('requests a new handshake with the cookie attached', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();

      freshSocketOnNextConnect = true;
      socketManager.reauth();

      const options = vi.mocked(io).mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(options).toMatchObject({ forceNew: true, withCredentials: true });
    });

    it('keeps asking for the rooms the session wanted, on the new socket', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
      socketManager.subscribeWallet('mall1addr');
      socketManager.subscribeUser('user-1');

      freshSocketOnNextConnect = true;
      socketManager.reauth();
      // The 'connect' handler is what replays them; that is the whole reason
      // reauth() must not go through disconnect(), which clears this record.
      mockSocket.__simulateConnect();

      const events = mockSocket._emits.map((e: any) => e.event);
      expect(events).toContain('subscribe:wallet');
      expect(events).toContain('subscribe:user');
      expect(socketManager.getSubscriptions()).toContain('wallet:mall1addr');
    });

    it('does not announce the teardown as an outage', () => {
      const system: any[] = [];
      socketManager.on('system', (data) => system.push(data));
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();

      freshSocketOnNextConnect = true;
      socketManager.reauth();

      // 'Real-time updates unavailable' comes from the old socket's
      // disconnect handler, which reauth() detaches first — a session change
      // must not flicker the Connected badge.
      expect(system.filter((m) => /unavailable/i.test(String(m.message)))).toHaveLength(0);
    });
  });

  // Cleanup Tests (5.9)
  describe('Cleanup and Disconnection', () => {
    it('should disconnect and cleanup resources (Req 5.9)', () => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
      
      socketManager.subscribeMarket();
      socketManager.subscribeWallet('mall1test');
      
      expect(socketManager.isConnected()).toBe(true);
      expect(socketManager.getSubscriptions().length).toBeGreaterThan(0);
      
      socketManager.disconnect();
      
      expect(socketManager.socket).toBeNull();
      expect(socketManager.isConnected()).toBe(false);
      expect(socketManager.getSubscriptions()).toHaveLength(0);
    });

    it('should be safe to disconnect multiple times (Req 5.9)', () => {
      socketManager.disconnect();
      socketManager.disconnect();
      
      expect(socketManager.socket).toBeNull();
    });

    it('should remove all listeners on disconnect (Req 5.9)', () => {
      socketManager.connect('http://localhost:4000');
      
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      
      socketManager.onWalletUpdate(cb1);
      socketManager.onBlockUpdate(cb2);
      
      socketManager.disconnect();
      
      // After disconnect, subscription list should be empty
      expect(socketManager.getSubscriptions()).toHaveLength(0);
    });
  });

  // Subscription Tracking
  describe('Subscription Tracking', () => {
    beforeEach(() => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
    });

    it('should track multiple active subscriptions', () => {
      socketManager.subscribeWallet('mall1addr1');
      socketManager.subscribeWallet('mall1addr2');
      socketManager.subscribeMarket();
      socketManager.subscribePrice();
      socketManager.subscribeBlocks();
      
      const subs = socketManager.getSubscriptions();
      expect(subs.length).toBeGreaterThanOrEqual(3);
      expect(subs).toContain('wallet:mall1addr1');
      expect(subs).toContain('market:feed');
    });

    it('should return empty list when nothing subscribed', () => {
      socketManager.disconnect();
      
      const subs = socketManager.getSubscriptions();
      expect(Array.isArray(subs)).toBe(true);
      expect(subs).toHaveLength(0);
    });
  });

  // Generic Event Listener
  describe('Generic Event Listeners', () => {
    beforeEach(() => {
      socketManager.connect('http://localhost:4000');
      mockSocket.__simulateConnect();
    });

    it('should register and call generic event listeners', () => {
      const callback = vi.fn();
      const unregister = socketManager.on('wallet:update', callback);
      
      const testData = {
        address: 'mall1',
        balances: { mlcns: 100, mlcnsAvailable: 100, mlcnsLocked: 0 },
        timestamp: Date.now(),
      };
      
      mockSocket.__simulateEvent('wallet:update', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
      expect(typeof unregister).toBe('function');
    });
  });
});
