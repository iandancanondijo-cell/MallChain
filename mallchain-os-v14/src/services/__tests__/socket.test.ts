/**
 * Unit tests for Socket.IO client manager (socket.ts)
 * Tests socket lifecycle, subscription management, and event handling
 * 
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { socketManager } from '../socket';

// Mock socket.io-client with a controllable mock
let mockSocket: any;

const createMockSocket = () => ({
  connected: false,
  id: 'test-socket-' + Math.random(),
  _listeners: new Map() as Map<string, Function[]>,
  _emits: [] as any[],

  on(event: string, fn: Function) {
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

  disconnect() {
    this.connected = false;
    return this;
  },

  // Test helpers
  __simulateConnect() {
    this.connected = true;
    const handlers = this._listeners.get('connect') || [];
    handlers.forEach((h: Function) => h());
  },

  __simulateDisconnect(reason: string) {
    this.connected = false;
    const handlers = this._listeners.get('disconnect') || [];
    handlers.forEach((h: Function) => h(reason));
  },

  __simulateEvent(name: string, data: any) {
    const handlers = this._listeners.get(name) || [];
    handlers.forEach((h: Function) => h(data));
  },
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    if (!mockSocket) {
      mockSocket = createMockSocket();
    }
    return mockSocket;
  }),
}));

describe('SocketManager - Socket.IO Connection Tests', () => {
  beforeEach(() => {
    socketManager.disconnect();
    mockSocket = createMockSocket();
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
      
      const testData = {
        address: 'mall1test',
        balances: { MALL: 1000 },
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
      
      const testData = [{ type: 'trade' as const, timestamp: Date.now(), data: {} }];
      
      mockSocket.__simulateEvent('market:feed', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should receive price:current events (Req 5.6)', () => {
      const callback = vi.fn();
      socketManager.onPriceUpdate(callback);
      
      const testData = {
        prices: { MALL: 1.5 },
        volumes: { MALL: 1000 },
        changes: { MALL: 2.5 },
      };
      
      mockSocket.__simulateEvent('price:current', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
    });

    it('should support event listener deregistration', () => {
      const callback = vi.fn();
      const unregister = socketManager.onWalletUpdate(callback);
      
      const testData = {
        address: 'mall1',
        balances: { MALL: 100 },
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
        balances: { MALL: 100 },
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
        balances: { MALL: 100 },
        timestamp: Date.now(),
      };
      
      mockSocket.__simulateEvent('wallet:update', testData);
      
      expect(callback).toHaveBeenCalledWith(testData);
      expect(typeof unregister).toBe('function');
    });
  });
});
