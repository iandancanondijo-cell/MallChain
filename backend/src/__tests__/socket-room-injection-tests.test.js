/**
 * Task 8.7: Socket Room Name Injection Attack Prevention Tests
 * 
 * Validates that socket subscription prevents injection attacks including:
 * - Room name manipulation/injection
 * - Attempted path traversal
 * - Special characters and encoding bypass
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

describe('Socket Room Injection Prevention', () => {
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

  test('Prevents room name injection with special characters', (done) => {
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

      // Try to inject room name
      const injectionAttempt = 'mall1test\',\'admin:*';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Prevents room name injection with semicolon/colon manipulation', (done) => {
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

      const injectionAttempt = 'mall1test:admin:root';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Prevents path traversal attempts', (done) => {
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

      const injectionAttempt = '../wallet:admin';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Prevents null byte injection', (done) => {
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

      const injectionAttempt = 'mall1test\x00admin';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Prevents attempted room name manipulation with wildcards', (done) => {
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

      const injectionAttempt = 'mall1*';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects address with SQL-like injection patterns', (done) => {
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

      const injectionAttempt = "mall1test'; DROP TABLE wallets--";
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects addresses with double encoding attempts', (done) => {
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

      // %25 is double-encoded %, attempting to bypass validation
      const injectionAttempt = 'mall1test%2F%2Fadmin';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects addresses with JSON manipulation', (done) => {
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

      // Try to inject object structure
      const injectionAttempt = '{"address":"admin"}';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Rejects addresses with escape character attempts', (done) => {
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

      const injectionAttempt = 'mall1test\\..\\..\\admin';
      client.emit('subscribe:wallet', injectionAttempt);

      setTimeout(() => {
        if (!errorReceived) {
          client.close();
          done(new Error('Expected error event'));
        }
      }, 200);
    });
  });

  test('Accepts only valid lowercase alphanumeric after mall1 prefix', (done) => {
    const port = server.address().port;
    const client = ioClient(`http://localhost:${port}`, { reconnection: false });

    client.on('connect', () => {
      const validAddress = 'mall1qwertyuiopasdfghjklzxcvbnm0123456789abcd';

      client.on('subscribed', (data) => {
        expect(data.address).toBe(validAddress);
        expect(data.room).toBe(`wallet:${validAddress}`);
        client.close();
        done();
      });

      client.emit('subscribe:wallet', validAddress);
    });
  });
});
