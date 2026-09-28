/**
 * Test for Socket.IO room isolation
 * Validates that wallet:A and wallet:B messages are properly isolated
 * Property 4: Socket Subscription Isolation from design.md
 * 
 * Task 5.11 Verification:
 * 1. When two clients subscribe to different wallets (wallet:mall1aaa vs wallet:mall1bbb)
 * 2. Events sent to wallet:mall1aaa should ONLY reach clients subscribed to wallet:mall1aaa
 * 3. Events sent to wallet:mall1bbb should ONLY reach clients subscribed to wallet:mall1bbb
 * 4. A client subscribed to both rooms should receive events from both
 * 5. A client NOT subscribed to a room should NOT receive events for that room
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

describe('Socket Room Isolation - Task 5.11 Verification', () => {
  let io, server;
  const TEST_TIMEOUT = 20000;
  
  beforeEach((done) => {
    server = createServer();
    io = new Server(server, {
      cors: { origin: '*' }
    });
    
    server.listen(() => {
      done();
    });
  });

  afterEach(() => {
    io.close();
    server.close();
  });

  test('Requirement 1-2: Event to wallet:mall1aaa is received by A but NOT B', (done) => {
    const port = server.address().port;

    // Set up socket connection handlers
    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        socket.join(`wallet:${address}`);
      });
    });

    // Connect two clients with different wallet addresses
    const clientA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientB = ioClient(`http://localhost:${port}`, { reconnection: false });

    let receivedCountA = 0;
    let receivedCountB = 0;
    let connectedCount = 0;

    const checkBothConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        // Wait for subscriptions to be processed before sending messages
        setTimeout(() => {
          // Both connected, now emit message
          io.to('wallet:mall1aaa').emit('wallet:update', {
            address: 'mall1aaa',
            balances: { MALL: 100 },
            timestamp: Date.now()
          });

          setTimeout(() => {
            expect(receivedCountA).toBe(1);
            expect(receivedCountB).toBe(0);
            clientA.close();
            clientB.close();
            done();
          }, 100);
        }, 100);
      }
    };

    // Client A subscribes to wallet:mall1aaa
    clientA.on('connect', () => {
      clientA.emit('subscribe:wallet', 'mall1aaa');
      clientA.on('wallet:update', (data) => {
        expect(data.address).toBe('mall1aaa');
        receivedCountA++;
      });
      checkBothConnected();
    });

    // Client B subscribes to wallet:mall1bbb
    clientB.on('connect', () => {
      clientB.emit('subscribe:wallet', 'mall1bbb');
      clientB.on('wallet:update', (data) => {
        expect(data.address).toBe('mall1bbb');
        receivedCountB++;
      });
      checkBothConnected();
    });
  }, TEST_TIMEOUT);

  test('Requirement 3: Event to wallet:mall1bbb is received by B but NOT A', (done) => {
    const port = server.address().port;

    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        socket.join(`wallet:${address}`);
      });
    });

    const clientA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientB = ioClient(`http://localhost:${port}`, { reconnection: false });

    let receivedCountA = 0;
    let receivedCountB = 0;
    let connectedCount = 0;

    const checkBothConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        // Wait for subscriptions to be processed before sending messages
        setTimeout(() => {
          io.to('wallet:mall1bbb').emit('wallet:update', {
            address: 'mall1bbb',
            balances: { MALL: 200 },
            timestamp: Date.now()
          });

          setTimeout(() => {
            expect(receivedCountB).toBe(1);
            expect(receivedCountA).toBe(0);
            clientA.close();
            clientB.close();
            done();
          }, 100);
        }, 100);
      }
    };

    clientA.on('connect', () => {
      clientA.emit('subscribe:wallet', 'mall1aaa');
      clientA.on('wallet:update', () => receivedCountA++);
      checkBothConnected();
    });

    clientB.on('connect', () => {
      clientB.emit('subscribe:wallet', 'mall1bbb');
      clientB.on('wallet:update', () => receivedCountB++);
      checkBothConnected();
    });
  }, TEST_TIMEOUT);

  test('Requirement 4: Client subscribed to BOTH rooms receives events from both', (done) => {
    const port = server.address().port;

    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        socket.join(`wallet:${address}`);
      });
    });

    const clientA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientBoth = ioClient(`http://localhost:${port}`, { reconnection: false });

    let countA_FromClientA = 0;
    let countA_FromClientBoth = 0;
    let countB_FromClientBoth = 0;
    let connectedCount = 0;

    const checkBothConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        // Wait for subscriptions to be processed before sending messages
        setTimeout(() => {
          io.to('wallet:mall1aaa').emit('wallet:update', {
            address: 'mall1aaa',
            balances: { MALL: 100 },
            timestamp: Date.now()
          });

          setTimeout(() => {
            io.to('wallet:mall1bbb').emit('wallet:update', {
              address: 'mall1bbb',
              balances: { MALL: 200 },
              timestamp: Date.now()
            });

            setTimeout(() => {
              expect(countA_FromClientA).toBe(1);
              expect(countA_FromClientBoth).toBe(1);
              expect(countB_FromClientBoth).toBe(1);
              clientA.close();
              clientBoth.close();
              done();
            }, 100);
          }, 100);
        }, 100);
      }
    };

    clientA.on('connect', () => {
      clientA.emit('subscribe:wallet', 'mall1aaa');
      clientA.on('wallet:update', () => countA_FromClientA++);
      checkBothConnected();
    });

    clientBoth.on('connect', () => {
      clientBoth.emit('subscribe:wallet', 'mall1aaa');
      clientBoth.emit('subscribe:wallet', 'mall1bbb');
      clientBoth.on('wallet:update', (data) => {
        if (data.address === 'mall1aaa') countA_FromClientBoth++;
        else if (data.address === 'mall1bbb') countB_FromClientBoth++;
      });
      checkBothConnected();
    });
  }, TEST_TIMEOUT);

  test('Requirement 5: Client NOT subscribed to room does NOT receive events for that room', (done) => {
    const port = server.address().port;

    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        socket.join(`wallet:${address}`);
      });
    });

    const clientA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientUnsubscribed = ioClient(`http://localhost:${port}`, { reconnection: false });

    let countA_FromClientA = 0;
    let countA_FromUnsubscribed = 0;
    let countB_FromUnsubscribed = 0;
    let connectedCount = 0;

    const checkBothConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        // Wait for subscriptions to be processed before sending messages
        setTimeout(() => {
          io.to('wallet:mall1aaa').emit('wallet:update', {
            address: 'mall1aaa',
            balances: { MALL: 100 },
            timestamp: Date.now()
          });

          setTimeout(() => {
            io.to('wallet:mall1bbb').emit('wallet:update', {
              address: 'mall1bbb',
              balances: { MALL: 200 },
              timestamp: Date.now()
            });

            setTimeout(() => {
              expect(countA_FromClientA).toBe(1);
              expect(countA_FromUnsubscribed).toBe(0);
              expect(countB_FromUnsubscribed).toBe(0);
              clientA.close();
              clientUnsubscribed.close();
              done();
            }, 100);
          }, 100);
        }, 100);
      }
    };

    clientA.on('connect', () => {
      clientA.emit('subscribe:wallet', 'mall1aaa');
      clientA.on('wallet:update', () => countA_FromClientA++);
      checkBothConnected();
    });

    clientUnsubscribed.on('connect', () => {
      clientUnsubscribed.on('wallet:update', (data) => {
        if (data.address === 'mall1aaa') countA_FromUnsubscribed++;
        else if (data.address === 'mall1bbb') countB_FromUnsubscribed++;
      });
      checkBothConnected();
    });
  }, TEST_TIMEOUT);

  test('Advanced: Multiple independent wallets without cross-talk', (done) => {
    const port = server.address().port;

    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        socket.join(`wallet:${address}`);
      });
    });

    const clientA = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientB = ioClient(`http://localhost:${port}`, { reconnection: false });
    const clientC = ioClient(`http://localhost:${port}`, { reconnection: false });

    const counts = { A: 0, B: 0, C: 0 };
    let connectedCount = 0;

    const checkAllConnected = () => {
      connectedCount++;
      if (connectedCount === 3) {
        setTimeout(() => {
          io.to('wallet:mall1aaa').emit('wallet:update', { address: 'mall1aaa' });

          setTimeout(() => {
            io.to('wallet:mall1bbb').emit('wallet:update', { address: 'mall1bbb' });

            setTimeout(() => {
              io.to('wallet:mall1ccc').emit('wallet:update', { address: 'mall1ccc' });

              setTimeout(() => {
                expect(counts.A).toBe(1);
                expect(counts.B).toBe(1);
                expect(counts.C).toBe(1);
                clientA.close();
                clientB.close();
                clientC.close();
                done();
              }, 100);
            }, 100);
          }, 100);
        }, 100);
      }
    };

    clientA.on('connect', () => {
      clientA.emit('subscribe:wallet', 'mall1aaa');
      clientA.on('wallet:update', () => counts.A++);
      checkAllConnected();
    });

    clientB.on('connect', () => {
      clientB.emit('subscribe:wallet', 'mall1bbb');
      clientB.on('wallet:update', () => counts.B++);
      checkAllConnected();
    });

    clientC.on('connect', () => {
      clientC.emit('subscribe:wallet', 'mall1ccc');
      clientC.on('wallet:update', () => counts.C++);
      checkAllConnected();
    });
  }, TEST_TIMEOUT);
});
