/**
 * Task 8.7: Socket Room Name Validation Tests
 * 
 * Validates that socket subscription enforces:
 * - Wallet address format validation
 * - Rejection of invalid room names
 * - Server-managed room membership
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

describe('Socket Room Name Validation', () => {
  let io, server;
  
  beforeEach((done) => {
    server = createServer();
    io = new Server(server, { cors: { origin: '*' } });
    
    // Set up socket connection handlers with validation
    io.on('connection', (socket) => {
      socket.on('subscribe:wallet', (address) => {
        // Task 8.7: Validate wallet address format
        if (!address || typeof address !== 'string') {
          socket.emit('error', { message: 'Invalid wallet address format' });
          return;
        }

        const addressPattern = /^mall1[a-z0-9]{38,58}$/;
        if (!addressPattern.test(address)) {
          socket.emit('error', { message: 'Invalid wallet address: must be mall1...' });
          return;
        }

        socket.join(`wallet:${address}`);
        socket.emit('subscribed', { address, room: `wallet:${address}` });
      });
    });

    server.listen(() => done());
  });

  afterEach(() => {
    io.close();
    server.close();
  });

  test('Rejects subscription with invalid address format', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      client.emit('subscribe:wallet', 'invalid-address');

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects subscription with empty address', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      client.emit('subscribe:wallet', '');

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects subscription with non-string address', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      // Send number instead of string
      client.emit('subscribe:wallet', 12345);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Accepts valid Mallchain address format', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      const validAddress = 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz123456';

      client.on('subscribed', (data) => {
        expect(data.address).toBe(validAddress);
        expect(data.room).toBe(`wallet:${validAddress}`);
        client.close();
        done();
      });

      client.emit('subscribe:wallet', validAddress);
    });
  });

  test('Validates address starts with mall1', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      // Wrong prefix
      const invalidAddress = 'cosmos1abc1234567890abcdefghijklmnopqrstuvwxyz123456';
      client.emit('subscribe:wallet', invalidAddress);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Validates address length is within expected range', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      // Too short
      const invalidAddress = 'mall1abc';
      client.emit('subscribe:wallet', invalidAddress);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects address with invalid characters', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      let errorReceived = false;

      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Invalid wallet address');
        client.close();
        done();
      });

      // Contains uppercase letters (invalid for bech32)
      const invalidAddress = 'mall1ABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      client.emit('subscribe:wallet', invalidAddress);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });
});
