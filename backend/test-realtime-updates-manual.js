#!/usr/bin/env node

/**
 * Task 14.2: Real-Time Updates - Manual Test Script
 * 
 * This script provides manual verification steps for end-to-end real-time updates:
 * 1. Sets up a simple Socket.IO server mirroring backend implementation
 * 2. Simulates blockchain events
 * 3. Shows how to verify the complete flow works
 * 
 * Usage:
 *   node test-realtime-updates-manual.js
 * 
 * Then in another terminal, use socket.io-client to connect and verify events
 */

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

const PORT = 4001; // Use different port to avoid conflicts with main backend

// Track connected clients for reporting
const clientMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  eventsEmitted: 0,
  walletSubscriptions: new Set(),
  blockSubscriptions: new Set()
};

/**
 * Task 5.1: Main connection handler
 */
io.on('connection', (socket) => {
  clientMetrics.totalConnections++;
  clientMetrics.activeConnections++;
  
  console.log(`[Socket Connected] ID: ${socket.id}, Total: ${clientMetrics.activeConnections}`);

  // Send initial connection message
  socket.emit('system', {
    message: 'Connected to Mallcoin realtime network',
    timestamp: Date.now()
  });

  /**
   * Task 5.3: Handle wallet subscription
   */
  socket.on('subscribe:wallet', (address) => {
    if (!address || typeof address !== 'string') {
      socket.emit('error', { message: 'Invalid wallet address format' });
      return;
    }

    // Task 8.7: Validate wallet address
    const addressPattern = /^mall1[a-z0-9]{38,58}$/;
    if (!addressPattern.test(address)) {
      socket.emit('error', { message: 'Invalid wallet address: must be mall1...' });
      return;
    }

    socket.join(`wallet:${address}`);
    clientMetrics.walletSubscriptions.add(address);
    
    console.log(`[Wallet Subscribe] Socket ${socket.id} → wallet:${address}`);

    // Task 5.6: Send cached wallet data immediately
    socket.emit('wallet:update', {
      address,
      balances: { mallcoin: 1000, gold: 50 },
      timestamp: Date.now()
    });
  });

  /**
   * Task 5.4: Handle wallet unsubscription
   */
  socket.on('unsubscribe:wallet', (address) => {
    if (!address || typeof address !== 'string') return;

    socket.leave(`wallet:${address}`);
    console.log(`[Wallet Unsubscribe] Socket ${socket.id} ← wallet:${address}`);
  });

  /**
   * Task 5.5: Handle blocks subscription
   */
  socket.on('subscribe:blocks', () => {
    socket.join('blocks:live');
    clientMetrics.blockSubscriptions.add(socket.id);
    console.log(`[Blocks Subscribe] Socket ${socket.id} → blocks:live`);
  });

  /**
   * Task 5.5: Handle price subscription
   */
  socket.on('subscribe:price', () => {
    socket.join('price:updates');
    console.log(`[Price Subscribe] Socket ${socket.id} → price:updates`);
  });

  /**
   * Task 5.5: Handle market subscription
   */
  socket.on('subscribe:market', () => {
    socket.join('market:feed');
    console.log(`[Market Subscribe] Socket ${socket.id} → market:feed`);
  });

  /**
   * Task 5.1: Handle disconnection
   */
  socket.on('disconnect', () => {
    clientMetrics.activeConnections--;
    console.log(`[Socket Disconnected] ID: ${socket.id}, Remaining: ${clientMetrics.activeConnections}`);
  });

  socket.on('error', (error) => {
    console.error(`[Socket Error] ${socket.id}: ${error}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Task 14.2: Real-Time Updates - Manual Test Server`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`✓ Socket.IO server listening on http://localhost:${PORT}`);
  console.log(`\nTo test real-time updates, you can:\n`);
  console.log(`1. Start the frontend: cd mallchain-os-v14 && npm run dev`);
  console.log(`   Make sure VITE_API_BASE_URL=http://localhost:4000 in .env\n`);
  console.log(`2. Or use socket.io-client directly:\n`);
  console.log(`   const io = require('socket.io-client');`);
  console.log(`   const socket = io('http://localhost:4001');`);
  console.log(`   socket.on('connect', () => {`);
  console.log(`     socket.emit('subscribe:wallet', 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz1234567');`);
  console.log(`   });`);
  console.log(`   socket.on('wallet:update', (data) => console.log('Update:', data));\n`);

  // Simulate blockchain events after startup
  setTimeout(() => {
    simulateBlockchainEvents();
  }, 2000);
});

/**
 * Simulate blockchain events to demonstrate real-time flow
 */
function simulateBlockchainEvents() {
  const WALLET = 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz1234567';
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Simulating blockchain events...`);
  console.log(`${'='.repeat(70)}\n`);

  // Simulate wallet transaction every 5 seconds
  let transactionCount = 0;
  const walletInterval = setInterval(() => {
    transactionCount++;
    const newBalance = 1000 + (transactionCount * 100);
    
    console.log(`[Event] Wallet transaction detected:`);
    console.log(`  → Address: ${WALLET}`);
    console.log(`  → New balance: ${newBalance} MALL`);
    console.log(`  → Subscribers: ${clientMetrics.walletSubscriptions.size}`);
    
    // Broadcast to all subscribers of this wallet
    io.to(`wallet:${WALLET}`).emit('wallet:update', {
      address: WALLET,
      balances: { mallcoin: newBalance, gold: 50 },
      timestamp: Date.now()
    });

    clientMetrics.eventsEmitted++;

    if (transactionCount >= 3) {
      clearInterval(walletInterval);
      console.log(`\n✓ Sample transactions complete\n`);
    }
  }, 5000);

  // Simulate block events every 8 seconds
  let blockCount = 0;
  const blockInterval = setInterval(() => {
    blockCount++;
    const blockHeight = 12345 + blockCount;
    
    console.log(`[Event] New block detected:`);
    console.log(`  → Height: ${blockHeight}`);
    console.log(`  → Transactions: ${Math.floor(Math.random() * 50)}`);
    console.log(`  → Subscribers: ${clientMetrics.blockSubscriptions.size}`);
    
    io.to('blocks:live').emit('block:new', {
      height: blockHeight,
      hash: Math.random().toString(16).substring(2, 34).toUpperCase(),
      timestamp: new Date().toISOString(),
      txCount: Math.floor(Math.random() * 50)
    });

    clientMetrics.eventsEmitted++;

    if (blockCount >= 2) {
      clearInterval(blockInterval);
      console.log(`\n✓ Sample blocks complete\n`);
    }
  }, 8000);

  // Simulate price updates every 3 seconds
  let priceUpdateCount = 0;
  const priceInterval = setInterval(() => {
    priceUpdateCount++;
    const basePrice = 0.50;
    const variance = (Math.random() - 0.5) * 0.10;
    
    console.log(`[Event] Price update:`);
    console.log(`  → MALL: $${(basePrice + variance).toFixed(4)}`);
    console.log(`  → Subscribers: ${io.sockets.adapter.rooms.get('price:updates')?.size || 0}`);
    
    io.to('price:updates').emit('price:current', {
      prices: { 
        mallcoin: basePrice + variance,
        gold: 1.25 + (Math.random() - 0.5) * 0.10
      },
      volumes: { 
        mallcoin: 50000 + Math.floor(Math.random() * 10000),
        gold: 10000 + Math.floor(Math.random() * 5000)
      },
      changes: { 
        mallcoin: variance.toFixed(2),
        gold: ((Math.random() - 0.5) * 2).toFixed(2)
      }
    });

    clientMetrics.eventsEmitted++;

    if (priceUpdateCount >= 3) {
      clearInterval(priceInterval);
      console.log(`\n✓ Sample price updates complete\n`);
    }
  }, 3000);

  // Print metrics every 10 seconds
  const metricsInterval = setInterval(() => {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Metrics:`);
    console.log(`  Active connections: ${clientMetrics.activeConnections}`);
    console.log(`  Total connections: ${clientMetrics.totalConnections}`);
    console.log(`  Events emitted: ${clientMetrics.eventsEmitted}`);
    console.log(`  Wallet subscriptions: ${clientMetrics.walletSubscriptions.size}`);
    console.log(`  Block subscriptions: ${clientMetrics.blockSubscriptions.size}`);
    console.log(`${'─'.repeat(70)}\n`);
  }, 10000);

  // Cleanup after 60 seconds
  setTimeout(() => {
    clearInterval(metricsInterval);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Test simulation complete. Connect a client to see events in action.`);
    console.log(`${'='.repeat(70)}\n`);
  }, 60000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n\nShutting down test server...`);
  io.close();
  server.close();
  process.exit(0);
});
