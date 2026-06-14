require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const db = require('./db');
const explorerRoutes = require('./routes/explorer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

const PORT = process.env.EXPLORER_API_PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

app.post('/internal/emit/new_block', async (req, res) => {
  const { height } = req.body;
  if (!height) {
    return res.status(400).json({ success: false, error: 'Height is required' });
  }

  try {
    await emitNewBlock(height);
    res.json({ success: true });
  } catch (err) {
    console.error('Error handling new_block emit request:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/emit/new_transactions', async (req, res) => {
  const { blockHeight } = req.body;
  if (!blockHeight) {
    return res.status(400).json({ success: false, error: 'blockHeight is required' });
  }

  try {
    await emitNewTransactions(blockHeight);
    res.json({ success: true });
  } catch (err) {
    console.error('Error handling new_transactions emit request:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/internal/emit/validator_update', async (req, res) => {
  const { address } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: 'address is required' });
  }

  try {
    await emitValidatorUpdate(address);
    res.json({ success: true });
  } catch (err) {
    console.error('Error handling validator_update emit request:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'explorer-api' });
});

// API Routes
app.use('/api/explorer', explorerRoutes);

// Socket.io events
io.on('connection', (socket) => {
  console.log('✓ Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('✗ Client disconnected:', socket.id);
  });

  socket.on('subscribe_blocks', () => {
    socket.join('blocks');
    console.log(`📌 Client ${socket.id} subscribed to blocks`);
  });

  socket.on('subscribe_transactions', () => {
    socket.join('transactions');
    console.log(`📌 Client ${socket.id} subscribed to transactions`);
  });

  socket.on('subscribe_validators', () => {
    socket.join('validators');
    console.log(`📌 Client ${socket.id} subscribed to validators`);
  });
});

// Function to emit new block
async function emitNewBlock(height) {
  try {
    const result = await db.query(
      'SELECT * FROM blocks WHERE height = $1',
      [height]
    );
    if (result.rows.length > 0) {
      io.to('blocks').emit('new_block', result.rows[0]);
    }
  } catch (err) {
    console.error('Error emitting new block:', err);
  }
}

// Function to emit new transactions
async function emitNewTransactions(blockHeight) {
  try {
    const result = await db.query(
      'SELECT * FROM transactions WHERE block_height = $1',
      [blockHeight]
    );
    io.to('transactions').emit('new_transactions', result.rows);
  } catch (err) {
    console.error('Error emitting new transactions:', err);
  }
}

// Function to emit validator update
async function emitValidatorUpdate(address) {
  try {
    const result = await db.query(
      'SELECT * FROM validators WHERE address = $1',
      [address]
    );
    if (result.rows.length > 0) {
      io.to('validators').emit('validator_update', result.rows[0]);
    }
  } catch (err) {
    console.error('Error emitting validator update:', err);
  }
}

// Export functions for use in external indexers
module.exports = {
  server,
  io,
  emitNewBlock,
  emitNewTransactions,
  emitValidatorUpdate,
};

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Explorer API server running on port ${PORT}`);
  });
}


// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📛 Shutting down Explorer API server...');
  await db.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});