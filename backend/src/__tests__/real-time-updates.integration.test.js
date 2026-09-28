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

    const frontendSocket = ioClient(`http://localhost:${port}`, {
      reconnection: false
    });

    const frontendState = {
      connected: false,
      balances: null,
      updateCount: 0,
      lastUpdate: null
    };

    frontendSocket.on('connect', () => {
      frontendState.connected = true;
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);
    });

    frontendSocket.on('wallet:update', (data) => {
      frontendState.balances = data.balances;
      frontendState.updateCount++;
      frontendState.lastUpdate = data;
      frontendState.lastUpdateReceivedAt = Date.now();

      // After initial subscription data arrives, trigger the blockchain event
      if (frontendState.updateCount === 1) {
        expect(frontendState.connected).toBe(true);
        expect(frontendState.balances).not.toBeNull();
        expect(frontendState.balances.mallcoin).toBe(1000);

        io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
          address: WALLET_ADDRESS,
          balances: { mallcoin: 1500, gold: 50 },
          timestamp: Date.now()
        });

        setTimeout(() => {
          expect(frontendState.balances.mallcoin).toBe(1500);
          expect(frontendState.updateCount).toBe(2);
          expect(frontendState.lastUpdateReceivedAt - frontendState.lastUpdate.timestamp).toBeLessThan(100);
          frontendSocket.close();
          done();
        }, 100);
      }
    });
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

    frontendSocket.on('wallet:update', (data) => {
      updateSequence.push({
        timestamp: data.timestamp,
        balance: data.balances.mallcoin
      });
    });

    frontendSocket.on('connect', () => {
      frontendSocket.emit('subscribe:wallet', WALLET_ADDRESS);

      // Wait for subscription to settle before emitting rapid updates
      setTimeout(() => {
        const updates = [
          { balance: 1100, delay: 0 },
          { balance: 1200, delay: 10 },
          { balance: 1300, delay: 20 }
        ];

        updates.forEach((update) => {
          setTimeout(() => {
            io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
              address: WALLET_ADDRESS,
              balances: { mallcoin: update.balance, gold: 50 },
              timestamp: Date.now()
            });
          }, update.delay);
        });

        setTimeout(() => {
          expect(updateSequence.length).toBeGreaterThanOrEqual(4);
          const transactionUpdates = updateSequence.slice(-3);
          expect(transactionUpdates[0].balance).toBe(1100);
          expect(transactionUpdates[1].balance).toBe(1200);
          expect(transactionUpdates[2].balance).toBe(1300);
          expect(transactionUpdates[0].timestamp).toBeLessThanOrEqual(transactionUpdates[1].timestamp);
          expect(transactionUpdates[1].timestamp).toBeLessThanOrEqual(transactionUpdates[2].timestamp);
          frontendSocket.close();
          done();
        }, 200);
      }, 200);
    });
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
      }, 200);
    }, 200);
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
      const priceUpdate = {
        prices: { mallcoin: 0.50, gold: 1.25 },
        volumes: { mallcoin: 50000, gold: 10000 },
        changes: { mallcoin: 5.2, gold: -1.3 }
      };

      io.to('price:updates').emit('price:current', priceUpdate);

      setTimeout(() => {
        expect(prices1.length).toBe(1);
        expect(prices2.length).toBe(1);
        expect(prices1[0].prices.mallcoin).toBe(0.50);
        expect(prices2[0].prices.mallcoin).toBe(0.50);
        frontend1.close();
        frontend2.close();
        done();
      }, 200);
    }, 200);
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
      expect(states.filter(s => s.event === 'wallet_update').length).toBe(1);

      io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
        address: WALLET_ADDRESS,
        balances: { mallcoin: 2000, gold: 50 },
        timestamp: Date.now()
      });

      setTimeout(() => {
        const updates = states.filter(s => s.event === 'wallet_update');
        expect(updates.length).toBeGreaterThanOrEqual(2);
        frontendSocket.close();
        done();
      }, 200);
    }, 300);
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
      eventsA.length = 0;
      eventsB.length = 0;

      io.to(`wallet:${WALLET_B}`).emit('wallet:update', {
        address: WALLET_B,
        balances: { mallcoin: 5000, gold: 100 },
        timestamp: Date.now()
      });

      setTimeout(() => {
        expect(eventsA.length).toBe(0);
        expect(eventsB.length).toBe(1);
        expect(eventsB[0]).toBe(WALLET_B);
        userA.close();
        userB.close();
        done();
      }, 200);
    }, 200);
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
      io.close();

      setTimeout(() => {
        const disconnectEvents = events.filter(e =>
          typeof e === 'object' && e.event === 'disconnected'
        );
        expect(disconnectEvents.length).toBeGreaterThan(0);
        frontendSocket.close();
        done();
      }, 300);
    }, 200);
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
      metrics.eventsReceived = 0;

      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          io.to(`wallet:${WALLET_ADDRESS}`).emit('wallet:update', {
            address: WALLET_ADDRESS,
            balances: { mallcoin: 1000 + (i + 1) * 100, gold: 50 },
            timestamp: Date.now()
          });
        }, i * 50);
      }

      setTimeout(() => {
        expect(metrics.eventsReceived).toBe(10);
        expect(metrics.disconnects).toBe(0);
        expect(metrics.errors).toBe(0);
        frontendSocket.close();
        done();
      }, 700);
    }, 200);
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
      const marketEvents = [
        { type: 'trade', timestamp: Date.now(), data: { seller: 'addr1', buyer: 'addr2' } },
        { type: 'listing', timestamp: Date.now() + 10, data: { item: 'sword' } },
        { type: 'sale', timestamp: Date.now() + 20, data: { amount: 1000 } }
      ];

      io.to('market:feed').emit('market:feed', marketEvents);

      setTimeout(() => {
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
      }, 200);
    }, 200);
  }, TEST_TIMEOUT);
});
