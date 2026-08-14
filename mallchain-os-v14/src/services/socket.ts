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

/**
 * Wallet data structure received from socket events
 * 
 * Sent by backend when wallet balance changes:
 * - address: Wallet address that was updated
 * - balances: Current token balances (e.g., { mallcoin: 1000, gold: 50 })
 * - timestamp: When update occurred (for UI: "updated 2s ago")
 */
export interface WalletData {
  address: string;
  balances: Record<string, number>;
  timestamp: number;
}

/**
 * Block data structure received from socket events
 * 
 * Sent by backend for each new blockchain block:
 * - height: Block number in chain
 * - hash: Block hash (unique identifier)
 * - timestamp: When block was mined
 * - txCount: Number of transactions in block (for UI stats)
 */
export interface BlockData {
  height: number;
  hash: string;
  timestamp: string;
  txCount: number;
}

/**
 * Market event structure
 * 
 * Represents marketplace activity (trades, listings, sales):
 * - type: 'trade' (user bought), 'listing' (item posted), 'sale' (completed sale)
 * - timestamp: When event occurred
 * - data: Event-specific data (varies by type)
 */
export interface MarketEvent {
  type: 'trade' | 'listing' | 'sale';
  timestamp: number;
  data: unknown;
}

/**
 * Price data structure
 * 
 * Sent by backend periodically with market prices:
 * - prices: Current token prices { mallcoin: 0.50, gold: 1.25 }
 * - volumes: 24h trading volume { mallcoin: 50000, gold: 10000 }
 * - changes: Percentage change in price { mallcoin: +5.2, gold: -1.3 }
 */
export interface PriceData {
  prices: Record<string, number>;
  volumes: Record<string, number>;
  changes: Record<string, number>;
}

/** A live-pushed notification (see backend/src/services/notify.js). */
export interface NotificationData {
  _id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** A live-pushed chat message (see backend/src/routes/messaging.js). */
export interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  ts: string;
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
  
  // Map of event name → array of listener callbacks
  // Allows multiple listeners for same event, cleanup functions return unsubscribe
  private eventListeners = new Map<string, Function[]>();
  
  // Reconnection exponential backoff state
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000; // 30 seconds max between attempts
  private baseReconnectDelay = 1000; // 1 second initial delay
  private reconnectMultiplier = 2; // Double delay each attempt (1s, 2s, 4s, 8s, ...)
  
  // Flag to prevent multiple concurrent connection attempts
  private isConnecting = false;

  /**
   * Task 5.2: Connect to backend Socket.IO server from config.apiBaseUrl
   * Skip connection if in demo mode (apiBaseUrl is empty)
   */
  connect(url?: string): void {
    // If no URL provided, use config.apiBaseUrl
    if (!url && !config.apiBaseUrl) {
      console.log('[Socket] Demo mode detected - skipping Socket.IO connection');
      return;
    }

    const socketUrl = url || config.apiBaseUrl || 'http://localhost:4000';
    
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('[Socket] Connection already in progress');
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
      });

      // Task 5.1: Socket lifecycle management - connection
      this.socket.on('connect', () => {
        console.log('[Socket] Connected:', this.socket?.id);
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        this.emit('system', { message: 'Connected to real-time updates' });
        
        // Task 5.8: Re-subscribe to all rooms on reconnection
        this.resubscribeAll();
      });

      // Task 5.1: Socket lifecycle management - disconnection
      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
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
      console.log('[Socket] Wallet update received:', data);
      this.emit('wallet:update', data);
    });

    // Task 5.6: Block events
    this.socket.on('block:new', (data: BlockData) => {
      console.log('[Socket] New block:', data);
      this.emit('block:new', data);
    });

    // Task 5.6: Market feed events
    this.socket.on('market:feed', (events: MarketEvent[]) => {
      console.log('[Socket] Market feed received:', events);
      this.emit('market:feed', events);
    });

    // Task 5.6: Price update events
    this.socket.on('price:current', (data: PriceData) => {
      console.log('[Socket] Price update received:', data);
      this.emit('price:current', data);
    });

    // System events
    this.socket.on('system', (data: { message: string; timestamp?: number }) => {
      console.log('[Socket] System message:', data.message);
      this.emit('system', data);
    });

    // Live notification push (see backend services/notify.js)
    this.socket.on('notification', (data: NotificationData) => {
      console.log('[Socket] Notification received:', data);
      this.emit('notification', data);
    });

    // Live chat message push (see backend routes/messaging.js)
    this.socket.on('message:new', (data: MessageData) => {
      console.log('[Socket] Message received:', data);
      this.emit('message:new', data);
    });
  }

  /** Subscribe to live messages for a specific conversation. */
  subscribeConversation(conversationId: string): void {
    if (!this.socket?.connected || !conversationId) return;
    const room = `conversation:${conversationId}`;
    if (this.subscriptions.has(room)) return;
    this.socket.emit('subscribe:conversation', conversationId);
    this.subscriptions.add(room);
  }

  unsubscribeConversation(conversationId: string): void {
    if (!this.socket?.connected || !conversationId) return;
    const room = `conversation:${conversationId}`;
    if (!this.subscriptions.has(room)) return;
    this.socket.emit('unsubscribe:conversation', conversationId);
    this.subscriptions.delete(room);
  }

  /** Register a live-message listener. */
  onMessage(callback: (data: MessageData) => void): () => void {
    return this.on('message:new', callback);
  }

  /** Subscribe to live notifications for a specific (Mongo) user id. */
  subscribeUser(userId: string): void {
    if (!this.socket?.connected || !userId) return;
    const room = `user:${userId}`;
    if (this.subscriptions.has(room)) return;
    this.socket.emit('subscribe:user', userId);
    this.subscriptions.add(room);
  }

  unsubscribeUser(userId: string): void {
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
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot subscribe - socket not connected');
      return;
    }

    if (!address) {
      console.error('[Socket] Cannot subscribe to wallet - no address provided');
      return;
    }

    const room = `wallet:${address}`;
    if (this.subscriptions.has(room)) {
      console.log('[Socket] Already subscribed to', room);
      return;
    }

    console.log('[Socket] Subscribing to wallet:', address);
    this.socket.emit('subscribe:wallet', address);
    this.subscriptions.add(room);
  }

  /**
   * Task 5.4: Unsubscribe from wallet updates for a specific address
   */
  unsubscribeWallet(address: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot unsubscribe - socket not connected');
      return;
    }

    if (!address) {
      console.error('[Socket] Cannot unsubscribe from wallet - no address provided');
      return;
    }

    const room = `wallet:${address}`;
    if (!this.subscriptions.has(room)) {
      console.log('[Socket] Not subscribed to', room);
      return;
    }

    console.log('[Socket] Unsubscribing from wallet:', address);
    this.socket.emit('unsubscribe:wallet', address);
    this.subscriptions.delete(room);
  }

  /**
   * Task 5.5: Subscribe to market activity feed
   * Emits 'subscribe:market' event and joins 'market:feed' room
   */
  subscribeMarket(): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot subscribe - socket not connected');
      return;
    }

    const room = 'market:feed';
    if (this.subscriptions.has(room)) {
      console.log('[Socket] Already subscribed to market feed');
      return;
    }

    console.log('[Socket] Subscribing to market feed');
    this.socket.emit('subscribe:market');
    this.subscriptions.add(room);
  }

  /**
   * Task 5.5: Subscribe to price updates
   * Emits 'subscribe:price' event and joins 'price:updates' room
   */
  subscribePrice(): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot subscribe - socket not connected');
      return;
    }

    const room = 'price:updates';
    if (this.subscriptions.has(room)) {
      console.log('[Socket] Already subscribed to price updates');
      return;
    }

    console.log('[Socket] Subscribing to price updates');
    this.socket.emit('subscribe:price');
    this.subscriptions.add(room);
  }

  /**
   * Task 5.5: Subscribe to live blocks
   * Emits 'subscribe:blocks' event and joins 'blocks:live' room
   */
  subscribeBlocks(): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot subscribe - socket not connected');
      return;
    }

    const room = 'blocks:live';
    if (this.subscriptions.has(room)) {
      console.log('[Socket] Already subscribed to live blocks');
      return;
    }

    console.log('[Socket] Subscribing to live blocks');
    this.socket.emit('subscribe:blocks');
    this.subscriptions.add(room);
  }

  /**
   * Task 5.8: Re-subscribe to all previously subscribed rooms on reconnection
   */
  private resubscribeAll(): void {
    const subscriptions = Array.from(this.subscriptions);
    console.log('[Socket] Re-subscribing to', subscriptions.length, 'rooms');

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
    this.eventListeners.get(event)!.push(callback as Function);

    // Return cleanup function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback as Function);
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
   * Task 5.6: Register market feed listener
   */
  onMarketFeed(callback: (events: MarketEvent[]) => void): () => void {
    return this.on('market:feed', callback);
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
      console.log('[Socket] Disconnecting');
      this.socket.disconnect();
      this.socket = null;
    }
    this.subscriptions.clear();
    this.eventListeners.clear();
    this.isConnecting = false;
    this.reconnectAttempt = 0;
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
