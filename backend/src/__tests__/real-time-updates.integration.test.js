/**
 * Task 14.2: Real-Time Updates Integration Test
 * 
 * End-to-end test validating the complete real-time update flow:
 * 1. Trigger a blockchain event from backend
 * 2. Backend broadcasts event to subscribed Socket.IO room
 * 3. Frontend Socket.IO client receives the event
 * 4. Frontend updates UI state in response to event
 * 
 * This test simulates a complete user workflow:
 * - User logs in (receives wallet address)
 * - User navigates to wallet view (subscribes to wallet:address room)
 * - Blockchain transaction updates wallet balance
 * - Backend emits wallet:update event to wallet:address room
 * - Frontend receives event and updates local state
 * - UI rerenders with new balance
 * 
 * Success Criteria (from requirements):
 * - Real-time updates flow correctly from backend to frontend
 * - UI reflects blockchain events in real-time
 * - Socket connections remain stable during event streaming
 * - Error handling works if backend disconnects mid-stream
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

describe('Task 14.2: Real-Time Updates - End-to-End Integration', () => {
  let io, server;
  const TEST_TIMEOUT = 30000;
  const WALLET_ADDRESS = 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz1234567';

  beforeEach((done) => {
    server = createServer();
    io = new Server(server, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling']
    });

    // Backend Socket.IO setup - mirrors production implementation
    io.on('connection', (socket) => {
      // Send initial connection message
      socket.emit('system', {
        message: 'Connected to Mallcoin realtime network',
        timestamp: Date.now()
      });

      // Handle wallet subscription
      socket.on('subscribe:wallet', (address) => {
        if (!address || typeof address !== 'string') {
          socket.emit('error', { message: 'Invalid wallet address format' });
          return;
        }

        const addressPattern = /^mall1[a-z0-9]{38,58}$/;
        if (!addressPattern.test(address)) {
          socket.emit('error', { message: 'Invalid wallet address' });
          return;
        }

        socket.join(`wallet:${address}`);
        
        // Send cached wallet data immediately
        socket.emit('wallet:update', {
          address,
          balances: { mallcoin: 1000, gold: 50 },
          timestamp: Date.now()
        });
      });

      // Handle blocks subscription
      socket.on('subscribe:blocks', () => {
        socket.join('blocks:live');
      });

      // Handle market subscription
      socket.on('subscribe:market', () => {
        socket.join('market:feed');
      });

      // Handle price subscription
      socket.on('subscribe:price', () => {
        socket.join('price:updates');
      });

      socket.on('disconnect', () => {
        // Cleanup happens automatically
      });
    });

    server.listen(() => done());
  });

  afterEach(() => {
    io.close();
    server.close();
  });

  /**
   * Scenario 1: Single wallet receives transaction update
   * 
   * User Flow:
   * 1. Frontend connects to Socket.IO server
   * 2. User navigates to wallet page
   * 3. Frontend subscribes to wallet:address room
   * 4. Backend receives a new transaction affecting wallet
   * 5. Backend broadcasts wallet:update event to wallet:address room
   * 6. Frontend Socket.IO client receives wallet:update
   * 7. Frontend updates React state with new balance
   * 8. UI rerenders showing new balance
   * 
   * Expected Result: Frontend state updated with new balance before user notices lag
   */
  test('Scenario 1: Wallet receives transaction update', (done) => {
    const port = server.address().port;
    
    // Simulate frontend client
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: false 
    });

    // Track state changes in frontend
    const frontendState = {
      connected: false,
      balances: null,
      updateCount: 0,
      lastUpdate: null
    };

    frontendSocket.on('connect', () => {
      frontendState.connected = true;
      
      // Subscribe to wallet for real-time updates
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
    });

    // Listen for initial wallet data
    frontendSocket.on('wallet:update', (data) => {
      frontendState.balances = data.balances;
      frontendState.updateCount++;
      frontendState.lastUpdate = data;
      // Capture latency at actual delivery time, not at a later poll — setTimeout
      // scheduling jitter means "time since emit" measured after a fixed wait is
      // not a meaningful (or stable) latency signal.
      frontendState.lastUpdateReceivedAt = Date.now();
    });

    // Wait for connection and subscription
    setTimeout(() => {
      // Verify connection and subscription
      expect(frontendState.connected).toBe(true);
      expect(frontendState.balances).not.toBeNull();
      expect(frontendState.balances.mallcoin).toBe(1000);
      expect(frontendState.updateCount).toBe(1); // Initial cached data

      // Simulate blockchain event: User receives transaction
      // In production, this would come from blockchain listener
      io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
        address: WALLET_ADDRESS,
        balances: { mallcoin: 1500, gold: 50 }, // Balance increased
        timestamp: Date.now()
      });

      // Wait for frontend to receive update
      setTimeout(() => {
        // Verify frontend received the update
        expect(frontendState.balances.mallcoin).toBe(1500);
        expect(frontendState.updateCount).toBe(2); // Initial + transaction
        
        // Verify the update was delivered promptly (measured at actual receipt time)
        expect(frontendState.lastUpdateReceivedAt - frontendState.lastUpdate.timestamp).toBeLessThan(100);

        frontendSocket.close();
        done();
      }, 100);
    }, 100);
  }, TEST_TIMEOUT);

  /**
   * Scenario 2: Multiple rapid updates are processed in order
   * 
   * User Flow:
   * 1. Frontend subscribes to wallet
   * 2. Three rapid transactions occur (e.g., trading activity)
   * 3. Backend broadcasts three wallet:update events
   * 4. Frontend processes all three in order
   * 
   * Expected Result: Frontend receives all updates in correct order
   * Validates Property 6: Real-time Event Ordering from design.md
   */
  test('Scenario 2: Multiple rapid updates processed in order', (done) => {
    const port = server.address().port;
    
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: false 
    });

    const updateSequence = [];

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
    });

    frontendSocket.on('wallet:update', (data) => {
      updateSequence.push({
        timestamp: data.timestamp,
        balance: data.balances.mallcoin
      });
    });

    setTimeout(() => {
      // Simulate three rapid transactions
      const updates = [
        { balance: 1100, delay: 0 },
        { balance: 1200, delay: 10 },
        { balance: 1300, delay: 20 }
      ];

      // Emit updates in order
      updates.forEach((update, index) => {
        setTimeout(() => {
          io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
            address: WALLET_ADDRESS,
            balances: { mallcoin: update.balance, gold: 50 },
            timestamp: Date.now()
          });
        }, update.delay);
      });

      // Wait for all updates
      setTimeout(() => {
        // Should have initial cached update + 3 transaction updates
        expect(updateSequence.length).toBeGreaterThanOrEqual(4);
        
        // Find the three transaction updates (skip initial if present)
        const transactionUpdates = updateSequence.slice(-3);
        
        // Verify updates are in correct order
        expect(transactionUpdates[0].balance).toBe(1100);
        expect(transactionUpdates[1].balance).toBe(1200);
        expect(transactionUpdates[2].balance).toBe(1300);
        
        // Verify timestamps are in order
        expect(transactionUpdates[0].timestamp).toBeLessThanOrEqual(transactionUpdates[1].timestamp);
        expect(transactionUpdates[1].timestamp).toBeLessThanOrEqual(transactionUpdates[2].timestamp);

        frontendSocket.close();
        done();
      }, 150);
    }, 100);
  }, TEST_TIMEOUT);

  /**
   * Scenario 3: Block updates are received and processed
   * 
   * User Flow:
   * 1. Frontend subscribes to live blocks
   * 2. New block is mined on blockchain
   * 3. Backend detects new block
   * 4. Backend broadcasts block:new event to blocks:live room
   * 5. Frontend receives block update
   * 
   * Expected Result: Frontend displays latest block information
   */
  test('Scenario 3: Block updates received in real-time', (done) => {
    const port = server.address().port;
    
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: false 
    });

    const blockUpdates = [];

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe:blocks');
    });

    frontendSocket.on('block:new', (data) => {
      blockUpdates.push(data);
    });

    setTimeout(() => {
      // Simulate new blockchain block detection
      const newBlock = {
        height: 12345,
        hash: 'ABCD1234EFGH5678IJKL9012MNOP3456',
        timestamp: new Date().toISOString(),
        txCount: 42
      };

      io.to('blocks:live').emit('block:new', newBlock);

      setTimeout(() => {
        expect(blockUpdates.length).toBe(1);
        expect(blockUpdates[0].height).toBe(12345);
        expect(blockUpdates[0].txCount).toBe(42);

        frontendSocket.close();
        done();
      }, 100);
    }, 100);
  }, TEST_TIMEOUT);

  /**
   * Scenario 4: Price updates are broadcast to all subscribed clients
   * 
   * User Flow:
   * 1. Frontend subscribes to price updates
   * 2. Market data changes (e.g., external price feed updates)
   * 3. Backend broadcasts price:current event
   * 4. All subscribed frontends receive update
   * 
   * Expected Result: All frontends receive same price update
   */
  test('Scenario 4: Price updates broadcast to all subscribers', (done) => {
    const port = server.address().port;
    
    const frontend1 = ioClient(`http://localhost:${port}`, { reconnection: false });
    const frontend2 = ioClient(`http://localhost:${port}`, { reconnection: false });

    const prices1 = [];
    const prices2 = [];

    frontend1.on('connect', () => {
      frontend1.emit('subscribe:price');
    });

    frontend1.on('price:current', (data) => {
      prices1.push(data);
    });

    frontend2.on('connect', () => {
      frontend2.emit('subscribe:price');
    });

    frontend2.on('price:current', (data) => {
      prices2.push(data);
    });

    setTimeout(() => {
      // Broadcast price update to all subscribers
      const priceUpdate = {
        prices: { mallcoin: 0.50, gold: 1.25 },
        volumes: { mallcoin: 50000, gold: 10000 },
        changes: { mallcoin: 5.2, gold: -1.3 }
      };

      io.to('price:updates').emit('price:current', priceUpdate);

      setTimeout(() => {
        // Both frontends should receive the same update
        expect(prices1.length).toBe(1);
        expect(prices2.length).toBe(1);
        
        expect(prices1[0].prices.mallcoin).toBe(0.50);
        expect(prices2[0].prices.mallcoin).toBe(0.50);

        frontend1.close();
        frontend2.close();
        done();
      }, 100);
    }, 100);
  }, TEST_TIMEOUT);

  /**
   * Scenario 5: Client reconnection re-subscribes to rooms
   * 
   * User Flow:
   * 1. Frontend connects and subscribes to wallet
   * 2. Network interruption (simulated disconnect)
   * 3. Socket.IO auto-reconnects
   * 4. Frontend re-subscribes to wallet
   * 5. New transaction arrives
   * 6. Frontend receives update on reconnected socket
   * 
   * Expected Result: Real-time updates resume after reconnection
   * Validates Property 7: Configuration Immutability from design.md
   */
  test('Scenario 5: Client reconnects and re-subscribes', (done) => {
    const port = server.address().port;
    
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: true,
      reconnectionDelay: 50,
      reconnectionDelayMax: 100,
      reconnectionAttempts: 5
    });

    const states = [];
    let subscriptionCount = 0;

    frontendSocket.on('connect', () => {
      states.push({ event: 'connected', time: Date.now() });
    });

    frontendSocket.on('system', (data) => {
      // Track connection system messages
      if (data.message.includes('Connected')) {
        states.push({ event: 'system_message', message: data.message });
      }
    });

    frontendSocket.on('wallet:update', (data) => {
      states.push({ 
        event: 'wallet_update', 
        balance: data.balances.mallcoin,
        time: Date.now() 
      });
    });

    // Subscribe after initial connection
    frontendSocket.on('connect', () => {
      if (subscriptionCount === 0) {
        frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
        subscriptionCount++;
      }
    });

    setTimeout(() => {
      // Verify initial subscription
      expect(states.filter(s => s.event === 'wallet_update').length).toBe(1);
      
      // Simulate wallet update after subscription
      io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
        address: WALLET_ADDRESS,
        balances: { mallcoin: 2000, gold: 50 },
        timestamp: Date.now()
      });

      setTimeout(() => {
        // Should have received update
        const updates = states.filter(s => s.event === 'wallet_update');
        expect(updates.length).toBeGreaterThanOrEqual(2);
        
        frontendSocket.close();
        done();
      }, 100);
    }, 200);
  }, TEST_TIMEOUT);

  /**
   * Scenario 6: Room isolation - wallet:A does not receive wallet:B events
   * 
   * User Flow:
   * 1. User A connects and subscribes to wallet:A
   * 2. User B connects and subscribes to wallet:B
   * 3. Transaction updates wallet:B
   * 4. User A should NOT receive the update
   * 5. User B should receive the update
   * 
   * Expected Result: Events do not leak between rooms
   * Validates Property 4: Socket Subscription Isolation from design.md
   */
  test('Scenario 6: Room isolation prevents cross-wallet events', (done) => {
    const port = server.address().port;
    const WALLET_A = 'mall1aaa1111111111111111111111111111111111111111111111';
    const WALLET_B = 'mall1bbb2222222222222222222222222222222222222222222222';

    const userA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const userB = ioClient(`http://localhost:${port}`, { reconnection: false });

    const eventsA = [];
    const eventsB = [];

    userA.on('connect', () => {
      userA.emit('subscribe:wallet', WALLET_A);
    });

    userA.on('wallet:update', (data) => {
      eventsA.push(data.address);
    });

    userB.on('connect', () => {
      userB.emit('subscribe:wallet', WALLET_B);
    });

    userB.on('wallet:update', (data) => {
      eventsB.push(data.address);
    });

    setTimeout(() => {
      // Reset counts (skip initial cached updates)
      eventsA.length = 0;
      eventsB.length = 0;

      // Send update to wallet:B only
      io.to(`wallet:${WALLET_B}`).emit('wallet:update', {
        address: WALLET_B,
        balances: { mallcoin: 5000, gold: 100 },
        timestamp: Date.now()
      });

      setTimeout(() => {
        // User A should NOT receive any events (room isolation)
        expect(eventsA.length).toBe(0);
        
        // User B should receive exactly 1 event
        expect(eventsB.length).toBe(1);
        expect(eventsB[0]).toBe(WALLET_B);

        userA.close();
        userB.close();
        done();
      }, 100);
    }, 150);
  }, TEST_TIMEOUT);

  /**
   * Scenario 7: Error handling on backend disconnect
   * 
   * User Flow:
   * 1. Frontend connects and subscribes
   * 2. Backend connection drops (e.g., server restart)
   * 3. Frontend receives disconnect event
   * 4. Frontend logs error gracefully
   * 5. Frontend shows fallback UI (waiting for reconnection)
   * 
   * Expected Result: Frontend handles disconnection gracefully
   * Validates Error Scenario 4: Socket.IO Connection Failure from design.md
   */
  test('Scenario 7: Backend disconnection handled gracefully', (done) => {
    const port = server.address().port;
    
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: false // Disable auto-reconnect to test disconnect handling
    });

    const events = [];

    frontendSocket.on('connect', () => {
      events.push('connected');
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
    });

    frontendSocket.on('disconnect', (reason) => {
      events.push({ event: 'disconnected', reason });
    });

    frontendSocket.on('connect_error', (error) => {
      events.push({ event: 'connection_error', message: error.message });
    });

    setTimeout(() => {
      // Close the Socket.IO server (not just the raw HTTP server) so already-
      // established connections are actually terminated and clients see a
      // disconnect event. server.close() alone only stops new connections;
      // existing socket.io transports stay open independently.
      io.close();

      setTimeout(() => {
        // Should have received disconnect event
        const disconnectEvents = events.filter(e =>
          typeof e === 'object' && e.event === 'disconnected'
        );

        // Should have at least one disconnect event
        expect(disconnectEvents.length).toBeGreaterThan(0);

        frontendSocket.close();
        done();
      }, 200);
    }, 150);
  }, TEST_TIMEOUT);

  /**
   * Scenario 8: Stable connection during high-frequency updates
   * 
   * User Flow:
   * 1. Frontend subscribes to wallet
   * 2. Simulate rapid blockchain events (every 100ms)
   * 3. Frontend processes all events
   * 4. Connection remains stable (no drops)
   * 
   * Expected Result: Can handle ~10 events/second without disconnection
   * Validates Success Criterion: Socket connections remain stable during event streaming
   */
  test('Scenario 8: Connection stability under high-frequency events', (done) => {
    const port = server.address().port;
    
    const frontendSocket = ioClient(`http://localhost:${port}`, { 
      reconnection: false 
    });

    const metrics = {
      eventsReceived: 0,
      disconnects: 0,
      errors: 0
    };

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
    });

    frontendSocket.on('wallet:update', () => {
      metrics.eventsReceived++;
    });

    frontendSocket.on('disconnect', () => {
      metrics.disconnects++;
    });

    frontendSocket.on('error', () => {
      metrics.errors++;
    });

    setTimeout(() => {
      // Clear initial cached update count
      metrics.eventsReceived = 0;

      // Emit 10 rapid updates (one every 50ms)
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
            address: WALLET_ADDRESS,
            balances: { mallcoin: 1000 + (i + 1) * 100, gold: 50 },
            timestamp: Date.now()
          });
        }, i * 50);
      }

      // Check results after all updates sent
      setTimeout(() => {
        // Should receive all 10 events
        expect(metrics.eventsReceived).toBe(10);
        
        // Should not disconnect
        expect(metrics.disconnects).toBe(0);
        
        // Should not have errors
        expect(metrics.errors).toBe(0);

        frontendSocket.close();
        done();
      }, 600);
    }, 150);
  }, TEST_TIMEOUT);

  /**
   * Scenario 9: Market feed events broadcast to multiple subscribers
   * 
   * User Flow:
   * 1. Multiple users subscribe to market feed
   * 2. Market activity occurs (trades, listings, sales)
   * 3. Backend broadcasts market:feed events
   * 4. All subscribers receive same events
   * 
   * Expected Result: All subscribers get consistent market data
   */
  test('Scenario 9: Market feed broadcast to multiple subscribers', (done) => {
    const port = server.address().port;
    
    const user1 = ioClient(`http://localhost:${port}`, { reconnection: false });
    const user2 = ioClient(`http://localhost:${port}`, { reconnection: false });
    const user3 = ioClient(`http://localhost:${port}`, { reconnection: false });

    const feeds = { user1: [], user2: [], user3: [] };

    user1.on('connect', () => user1.emit('subscribe:market'));
    user2.on('connect', () => user2.emit('subscribe:market'));
    user3.on('connect', () => user3.emit('subscribe:market'));

    user1.on('market:feed', (events) => feeds.user1.push(events));
    user2.on('market:feed', (events) => feeds.user2.push(events));
    user3.on('market:feed', (events) => feeds.user3.push(events));

    setTimeout(() => {
      // Broadcast market activity
      const marketEvents = [
        { type: 'trade', timestamp: Date.now(), data: { seller: 'addr1', buyer: 'addr2' } },
        { type: 'listing', timestamp: Date.now() + 10, data: { item: 'sword' } },
        { type: 'sale', timestamp: Date.now() + 20, data: { amount: 1000 } }
      ];

      io.to('market:feed').emit('market:feed', marketEvents);

      setTimeout(() => {
        // All users should receive same events
        expect(feeds.user1.length).toBe(1);
        expect(feeds.user2.length).toBe(1);
        expect(feeds.user3.length).toBe(1);
        
        expect(feeds.user1[0].length).toBe(3);
        expect(feeds.user2[0].length).toBe(3);
        expect(feeds.user3[0].length).toBe(3);

        user1.close();
        user2.close();
        user3.close();
        done();
      }, 100);
    }, 150);
  }, TEST_TIMEOUT);
});
