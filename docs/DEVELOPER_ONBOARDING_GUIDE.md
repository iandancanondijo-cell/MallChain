# Developer Onboarding Guide: Backend-Frontend Integration

Welcome to Mallchain! This guide walks you through setting up your development environment, understanding the architecture, and executing common development tasks. Whether you're contributing to the blockchain backend, the Node.js/Express API server, or the React frontend, you'll find everything you need to get started.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Local Development Environment Setup](#local-development-environment-setup)
3. [Running Backend and Frontend Locally](#running-backend-and-frontend-locally)
4. [Architecture Overview and Data Flow](#architecture-overview-and-data-flow)
5. [Common Development Tasks](#common-development-tasks)
6. [Debugging Techniques and Tools](#debugging-techniques-and-tools)
7. [Testing Procedures](#testing-procedures)
8. [Git Workflow and Contribution Guidelines](#git-workflow-and-contribution-guidelines)
9. [Troubleshooting Common Issues](#troubleshooting-common-issues)
10. [Quick Reference: API Endpoints](#quick-reference-api-endpoints)
11. [FAQ](#faq)

---

## Quick Start

Get everything running in 5 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/mallchain/marketplace-blockchain.git
cd marketplace-blockchain

# 2. Install all dependencies
npm install
cd mallchain-os-v14 && npm install && cd ..

# 3. Copy environment files
cp .env.example .env
cd mallchain-os-v14 && cp .env.example .env && cd ..

# 4. Start the full stack (blockchain, backend, frontend)
./START_ALL.sh

# 5. Open browser
open http://localhost:5173
```

**Expected output:**
- Blockchain node listening on port 26657 (RPC) and 1317 (REST)
- Backend API listening on port 4000
- Frontend running on port 5173

For detailed setup, continue to the next section.

---

## Local Development Environment Setup

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** (v20 recommended): [Download Node.js](https://nodejs.org/)
  ```bash
  node --version  # Should be v18.0.0 or higher
  npm --version   # Should be v9.0.0 or higher
  ```

- **MongoDB 5+**: [Install MongoDB Community](https://docs.mongodb.com/manual/installation/)
  ```bash
  # Start MongoDB locally (macOS)
  brew services start mongodb-community
  
  # Or on Linux
  sudo systemctl start mongod
  
  # Verify connection
  mongo --eval "db.adminCommand('ping')"
  ```

- **Redis 6+**: [Install Redis](https://redis.io/download)
  ```bash
  # Start Redis locally (macOS)
  brew services start redis
  
  # Or on Linux
  sudo systemctl start redis-server
  
  # Verify connection
  redis-cli ping  # Should return PONG
  ```

- **Git**: For version control

- **Postman or similar API client** (optional): For testing API endpoints

### Step 1: Clone the Repository

```bash
git clone https://github.com/mallchain/marketplace-blockchain.git
cd marketplace-blockchain
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd mallchain-os-v14
npm install
cd ..

# Install backend dependencies (if separate backend folder)
# cd backend && npm install && cd ..
```

### Step 3: Configure Environment Variables

#### Backend Configuration

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` with your development values:

```ini
# Server Configuration
NODE_ENV=development
PORT=4000

# Database
MONGO_URI=mongodb://localhost:27017/mallchain_dev

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379

# Security Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=YOUR_32_CHARACTER_RANDOM_STRING_HERE_1234567890
SESSION_SECRET=YOUR_32_CHARACTER_RANDOM_STRING_HERE_0987654321

# Frontend URLs
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
BACKEND_PUBLIC_URL=http://localhost:4000

# Blockchain Configuration
CHAIN_ID=mallchain-testnet-1
CHAIN_RPC=http://localhost:26657
CHAIN_REST=http://localhost:1317
```

**Generate secure secrets:**
```bash
openssl rand -base64 32
# Copy output to JWT_SECRET and SESSION_SECRET
```

#### Frontend Configuration

Navigate to frontend directory:
```bash
cd mallchain-os-v14
cp .env.example .env
```

Edit `.env`:

**For development WITH backend (recommended):**
```ini
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_MODE=false
VITE_NETWORK=testnet
VITE_SESSION_TTL=120
```

**OR for demo mode WITHOUT backend:**
```ini
VITE_API_BASE_URL=
VITE_DEMO_MODE=true
VITE_NETWORK=testnet
VITE_SESSION_TTL=120
```

### Step 4: Verify All Services Are Running

Before starting the Mallchain services, verify dependencies:

```bash
# MongoDB
mongo --eval "db.adminCommand('ping')"
# Expected: { "ok" : 1 }

# Redis
redis-cli ping
# Expected: PONG

# Node.js
node --version
npm --version
```

---

## Running Backend and Frontend Locally

### Automated Setup: Using START_ALL.sh

The easiest way to start everything:

```bash
./START_ALL.sh
```

This script starts (in order):
1. **Blockchain node** (port 26657/1317)
2. **Backend API** (port 4000)
3. **Frontend** (port 5173)

Check the output for any errors. Each service logs its startup status.

**Stop all services:**
```bash
./STOP_ALL.sh
```

### Manual Setup: Start Each Service Separately

For more control or debugging, start services manually in separate terminals:

#### Terminal 1: Blockchain Node

```bash
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

Wait for it to stabilize (look for "Starting ABCI with Tendermint" message).

#### Terminal 2: Backend API

```bash
cd /path/to/repo
npm run dev
# or
node server.js
```

**Expected output:**
```
✓ Server listening on port 4000
✓ MongoDB connected
✓ Redis connected
✓ Socket.IO server ready
✓ CORS configured for origins: http://localhost:5173
```

#### Terminal 3: Frontend

```bash
cd mallchain-os-v14
npm run dev
```

**Expected output:**
```
Local:   http://localhost:5173/
press h + enter to show help
```

#### Terminal 4 (Optional): Blockchain Monitor

Watch blockchain events:
```bash
tail -f blockchain_working/app.log
```

### Verify Everything Is Running

```bash
# Check blockchain RPC
curl http://localhost:26657/health

# Check backend health
curl http://localhost:4000/api/health

# Check frontend loads
curl http://localhost:5173

# Open in browser
open http://localhost:5173
```

---

## Architecture Overview and Data Flow

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vite + React)                  │
│                   Port: 5173, Process: npm                  │
├─────────────────────────────────────────────────────────────┤
│  Components  │  Router  │  Store  │  API Service  │  Socket │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼ HTTP REST              ▼ WebSocket
┌──────────────────────┐    ┌──────────────────────┐
│   Backend API        │    │   Socket.IO Server   │
│  Port: 4000          │    │   (in Backend)       │
│  Express.js          │    └──────────────────────┘
├──────────────────────┤
│  Routes  │  Auth     │
│  CORS    │  Errors   │
└────┬─────┴──────┬────┘
     │            │
     ▼ MongoDB    ▼ Redis
┌─────────────┐ ┌──────────┐
│  Database   │ │  Cache   │
│  Port: 27017│ │ Port: 6379
└─────────────┘ └──────────┘
     │                │
     └────────────────┘
          │
          ▼ CosmJS
    ┌──────────────────────┐
    │  Blockchain Node     │
    │  Port: 26657/1317    │
    │  (marketplaced)      │
    └──────────────────────┘
```

### Request Flow: User Logs In

```
1. User enters credentials in frontend
   └─> React component in #/auth/login

2. Frontend sends POST to backend
   └─> api.post('/api/auth/login', { username, password })

3. Backend receives request
   └─> Express route handler validates credentials

4. Backend queries MongoDB
   └─> Looks up user, verifies password with bcrypt

5. Backend generates JWT token
   └─> Payload: { userId, username, exp }
   └─> Signed with JWT_SECRET

6. Backend returns response
   └─> { ok: true, data: { token, user } }

7. Frontend stores token in localStorage
   └─> localStorage.setItem('auth_token', token)

8. Frontend redirects to dashboard
   └─> window.location.hash = '#/dashboard'

9. Subsequent API calls include Authorization header
   └─> Authorization: Bearer <token>

10. Backend auth middleware validates token on protected routes
    └─> Extracts token from header
    └─> Verifies signature with JWT_SECRET
    └─> Attaches user to req.user
```

### Real-Time Data Flow: Wallet Updates via Socket.IO

```
1. User navigates to wallet page
   └─> Frontend subscribes to wallet updates
   └─> socket.emit('subscribe:wallet', address)

2. Backend Socket.IO server receives subscription
   └─> socket.join('wallet:' + address)
   └─> Sends cached wallet data immediately

3. Blockchain detects new transaction
   └─> Blockchain node processes block
   └─> Backend polls blockchain every 3 seconds

4. Backend detects wallet change
   └─> Queries blockchain for updated balance
   └─> Updates Redis cache

5. Backend broadcasts to all connected clients
   └─> io.to('wallet:address').emit('wallet:update', data)

6. Frontend receives Socket.IO event
   └─> socket.on('wallet:update', (data) => {...})

7. Frontend updates React component state
   └─> Component re-renders with new balance

8. User sees real-time update
   └─> No refresh needed, instant update
```

### Data Sources: API Endpoints

**Authentication:**
- `POST /api/auth/login` — User login
- `POST /api/auth/register` — User registration
- `POST /api/auth/logout` — User logout

**Blockchain Data:**
- `GET /api/health` — Service health and blockchain status
- `GET /api/wallets/:address/balances` — Account balance
- `GET /api/transactions/:address` — Transaction history
- `GET /api/validators` — Validator list
- `GET /api/staking/:address` — Staking information

**Transactions:**
- `POST /api/tx` — Send transaction (requires auth)
- `GET /api/tx/:txHash` — Transaction status

**Real-Time Data:**
- **Socket.IO Events:**
  - `subscribe:wallet` — Listen to wallet changes
  - `wallet:update` — Receive wallet updates
  - `subscribe:blocks` — Listen to new blocks
  - `block:new` — Receive new block notifications
  - `subscribe:market` — Listen to market activity
  - `market:feed` — Receive market updates

---

## Common Development Tasks

### Task 1: Add a New API Endpoint

**Example: Create `/api/products` endpoint to list marketplace products**

#### 1. Define the Route (Backend)

Create or edit `src/routes/products.js`:

```javascript
const express = require('express');
const router = express.Router();

// GET /api/products - List all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().lean();
    res.json({ ok: true, data: products });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/products/:id - Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    res.json({ ok: true, data: product });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
```

#### 2. Register the Route (Backend)

In `src/server.js` or main app file:

```javascript
const productsRouter = require('./routes/products');
app.use('/api/products', productsRouter);
```

#### 3. Test the Endpoint (Backend)

```bash
# Test listing products
curl http://localhost:4000/api/products

# Test getting specific product
curl http://localhost:4000/api/products/60d5ec49c1234567890abcde
```

#### 4. Create API Service Method (Frontend)

In `src/services/api.ts`:

```typescript
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

class Api {
  async getProducts(): Promise<ApiResult<Product[]>> {
    return this.get('/products');
  }

  async getProduct(id: string): Promise<ApiResult<Product>> {
    return this.get(`/products/${id}`);
  }
}

export const api = new Api();
```

#### 5. Use in Frontend Component

In `src/components/Products.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProducts() {
      const result = await api.getProducts();
      if (result.ok) {
        setProducts(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    loadProducts();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {products.map((p) => (
        <div key={p.id}>{p.name} - ${p.price}</div>
      ))}
    </div>
  );
}
```

#### 6. Test the Full Flow

1. Backend running: `npm run dev` (Terminal 2)
2. Frontend running: `cd mallchain-os-v14 && npm run dev` (Terminal 3)
3. Navigate to products page in UI
4. Verify products load and display

### Task 2: Create a Socket.IO Event Handler

**Example: Broadcast real-time marketplace price updates**

#### 1. Backend: Emit Price Updates

In `src/services/marketPrices.js`:

```javascript
const io = require('../socket'); // Global Socket.IO instance

async function broadcastPriceUpdate() {
  // Query blockchain or price service for latest prices
  const prices = await fetchCurrentPrices();
  
  // Broadcast to all clients subscribed to price:updates room
  io.to('price:updates').emit('price:current', {
    prices,
    timestamp: Date.now(),
  });
}

// Poll for price changes every 5 seconds
setInterval(broadcastPriceUpdate, 5000);
```

#### 2. Backend: Handle Subscription

In `src/socket/index.js`:

```javascript
const { io } = require('../server');

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle subscription to price updates
  socket.on('subscribe:price', () => {
    socket.join('price:updates');
    console.log(`${socket.id} subscribed to prices`);
  });

  // Handle unsubscription
  socket.on('unsubscribe:price', () => {
    socket.leave('price:updates');
    console.log(`${socket.id} unsubscribed from prices`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});
```

#### 3. Frontend: Connect and Listen

In `src/services/socket.ts`:

```typescript
import { io, Socket } from 'socket.io-client';

export class SocketManager {
  private socket: Socket | null = null;

  connect(url: string) {
    this.socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  subscribePrice(callback: (data: PriceData) => void) {
    if (!this.socket) return;
    this.socket.emit('subscribe:price');
    this.socket.on('price:current', callback);
  }

  unsubscribePrice() {
    if (!this.socket) return;
    this.socket.emit('unsubscribe:price');
    this.socket.off('price:current');
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const socketManager = new SocketManager();
```

#### 4. Frontend: Use in Component

In `src/components/PriceTracker.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { socketManager } from '../services/socket';

export function PriceTracker() {
  const [prices, setPrices] = useState({});

  useEffect(() => {
    // Connect to socket
    socketManager.connect('http://localhost:4000');

    // Subscribe to prices
    socketManager.subscribePrice((data) => {
      setPrices(data.prices);
    });

    // Cleanup on unmount
    return () => {
      socketManager.unsubscribePrice();
      socketManager.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>Live Prices</h2>
      {Object.entries(prices).map(([asset, price]) => (
        <div key={asset}>
          {asset}: ${price}
        </div>
      ))}
    </div>
  );
}
```

#### 5. Test

1. Backend running with Socket.IO (port 4000)
2. Frontend connected to backend
3. Subscribe to prices in UI
4. Watch prices update in real-time

### Task 3: Update Frontend Store State

**Example: Add new field to user profile**

#### 1. Define TypeScript Interface

In `src/store/types.ts`:

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
  profileImage?: string;  // NEW FIELD
  bio?: string;           // NEW FIELD
}
```

#### 2. Update Store Initial State

In `src/store/store.ts`:

```typescript
const initialState: State = {
  user: {
    id: '',
    username: '',
    email: '',
    profileImage: '',
    bio: '',
  },
  // ... other state
};
```

#### 3. Create Store Update Method

In `src/store/store.ts`:

```typescript
export const store = {
  state: initialState,

  updateProfile(profile: Partial<User>) {
    this.state.user = { ...this.state.user, ...profile };
    this.commit(); // Save to localStorage
  },

  commit() {
    localStorage.setItem('mallchain_state', JSON.stringify(this.state));
    this.notify();
  },

  notify() {
    this.subscribers.forEach(fn => fn(this.state));
  },
};
```

#### 4. Use in Component

In `src/components/ProfileEdit.tsx`:

```typescript
import { store } from '../store/store';

export function ProfileEdit() {
  const [bio, setBio] = useState(store.state.user.bio);

  function handleSave() {
    store.updateProfile({ bio });
    // Optionally sync to backend
    api.post('/api/profile', { bio });
  }

  return (
    <div>
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

---

## Debugging Techniques and Tools

### Browser DevTools

#### 1. Network Inspection

**Debug API calls:**
1. Open DevTools: `F12` or `Cmd+Opt+I`
2. Go to **Network** tab
3. Perform action that makes API call
4. Click the request to see:
   - **Request headers:** Authorization token, Content-Type, etc.
   - **Request body:** Payload sent to backend
   - **Response body:** Data returned from backend
   - **Response status:** 200 (success) or error codes

**Simulate slow network:**
1. Network tab → Throttling dropdown
2. Select "Slow 3G" or "Fast 3G"
3. Retest to see how app behaves with latency

#### 2. Console Debugging

**Check Socket.IO connection:**
```javascript
// In browser console
console.log(window.socket);  // Check if socket is connected
window.socket.on('*', (event, data) => console.log(event, data)); // Log all events
```

**Check frontend config:**
```javascript
// In browser console
console.log(import.meta.env);  // Shows all env vars
```

**Check localStorage:**
```javascript
// In browser console
localStorage.getItem('mallchain_state');  // View store state
localStorage.getItem('auth_token');       // View auth token
```

#### 3. React DevTools

**Install extension:**
- Chrome: [React DevTools](https://chrome.google.com/webstore/detail/react-developer-tools/)
- Firefox: [React DevTools](https://addons.mozilla.org/firefox/addon/react-devtools/)

**Debug component state:**
1. Open DevTools → Components tab
2. Find component in tree
3. View props and hooks state
4. Edit state to test different scenarios

**Debug re-renders:**
1. Components tab → Gear icon
2. Enable "Highlight updates when components render"
3. Interact with app, see which components re-render

### Backend Debugging

#### 1. Console Logging

Add logging to debug backend code:

```javascript
console.log('Received login request:', req.body);
console.log('User found:', user);
console.error('Database error:', error);
```

Run backend with debug output:
```bash
DEBUG=* npm run dev
```

#### 2. Backend Debugger

**Using VS Code:**
1. Open `.vscode/launch.json`
2. Add configuration:
```json
{
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/server.js",
  "restart": true,
  "console": "integratedTerminal"
}
```

3. Press `F5` to start debugging
4. Set breakpoints by clicking line numbers
5. Step through code with F10 (step over) or F11 (step into)

**Using Chrome DevTools:**
```bash
node --inspect-brk server.js
# Then open chrome://inspect in Chrome
```

#### 3. Log Analysis

View backend logs:
```bash
tail -f server.log

# Or filter for errors
tail -f server.log | grep ERROR
```

### Postman API Testing

**Test endpoints without frontend:**

1. **Create request:**
   - Method: POST
   - URL: `http://localhost:4000/api/auth/login`
   - Body (JSON):
   ```json
   {
     "username": "testuser",
     "password": "testpass"
   }
   ```
   - Send

2. **Add authentication:**
   - Get token from login response
   - Next request → Authorization tab
   - Type: Bearer Token
   - Token: (paste token from login)
   - Send

3. **Save collection:**
   - File → Export
   - Share with team or save for later

### MongoDB Inspection

**View data in MongoDB:**

```bash
# Connect to MongoDB
mongo

# Switch to database
use mallchain_dev

# List collections
show collections

# Query collection
db.users.findOne()
db.users.find().pretty()

# Update document
db.users.updateOne({ username: "test" }, { $set: { verified: true } })

# Delete document
db.users.deleteOne({ username: "test" })
```

**GUI Tools:**
- [MongoDB Compass](https://www.mongodb.com/products/compass) — GUI for MongoDB
- [Studio 3T](https://studio3t.com/) — Advanced MongoDB IDE

### Redis Inspection

**View Redis data:**

```bash
# Connect to Redis CLI
redis-cli

# List all keys
keys *

# Get value
get auth_session:abc123

# Set value
set debug:value "test"

# Delete key
del auth_session:abc123

# Monitor all commands
monitor
```

---

## Testing Procedures

### Running Unit Tests

**Frontend tests:**

```bash
cd mallchain-os-v14
npm run test              # Run all tests
npm run test -- --watch   # Watch mode
npm run test -- --coverage # With coverage
```

**Backend tests:**

```bash
npm run test              # Run all tests
npm run test -- --watch   # Watch mode
npm run test -- --coverage # With coverage
```

### Running Integration Tests

**Full stack test (backend + frontend + blockchain):**

```bash
# Start all services
./START_ALL.sh

# Wait for services to stabilize (30 seconds)

# Run integration tests
npm run test:integration

# Or manual testing with checklist (see below)
```

### Manual Testing Checklist

Complete this checklist before marking work as done:

- [ ] **Backend starts successfully**
  ```bash
  npm run dev
  # Verify: "Server listening on port 4000"
  ```

- [ ] **Frontend starts successfully**
  ```bash
  cd mallchain-os-v14 && npm run dev
  # Verify: "Local: http://localhost:5173/"
  ```

- [ ] **Health check works**
  ```bash
  curl http://localhost:4000/api/health
  # Verify: JSON response with status: ok
  ```

- [ ] **Frontend loads**
  - Open http://localhost:5173
  - No errors in browser console

- [ ] **Authentication works**
  - Register new account
  - Login with credentials
  - Token stored in localStorage

- [ ] **API calls work**
  - Navigate to different pages
  - DevTools Network tab: requests return 200 OK

- [ ] **Real-time updates work**
  - Browser console: `window.socket?.id` returns socket ID
  - Subscribe to data (e.g., wallet updates)
  - Changes appear without page refresh

- [ ] **Error handling works**
  - Stop backend
  - Try API call from frontend
  - See friendly error message (not crash)

- [ ] **Rate limiting works**
  - Make 150 API calls in 1 minute
  - After 120 requests, get 429 response

### Writing New Tests

**Frontend unit test example:**

Create `src/services/api.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { api } from './api';

describe('API Service', () => {
  it('should add Authorization header when token exists', () => {
    localStorage.setItem('auth_token', 'test-token');
    
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
    );

    api.get('/test');

    const call = (global.fetch as any).mock.calls[0];
    expect(call[1].headers.Authorization).toBe('Bearer test-token');
  });

  it('should handle network errors', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network error'))
    );

    const result = await api.get('/test');
    
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network error');
  });
});
```

Run test:
```bash
npm run test api.test.ts
```

---

## Git Workflow and Contribution Guidelines

### Branch Strategy

```
main (production-ready code)
  └── develop (integration branch)
       └── feature/user-auth (your feature)
            └── feature/user-auth-jwt (sub-feature)
```

### Creating a Feature Branch

```bash
# 1. Start from develop
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/add-marketplace

# 3. Make changes
# ... edit files ...

# 4. Commit changes
git add src/components/Marketplace.tsx
git commit -m "Add marketplace listing component"

# 5. Push to remote
git push origin feature/add-marketplace

# 6. Create Pull Request
# Go to GitHub → New Pull Request
# Select: develop ← feature/add-marketplace
# Add description and title
# Request review from team
```

### Commit Message Format

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Code style (formatting)
- `refactor:` — Code refactor
- `test:` — Tests
- `chore:` — Build/dependencies

**Examples:**
```
feat(auth): add JWT token refresh
fix(wallet): prevent double-spending
docs(api): update endpoint reference
test(marketplace): add product filtering tests
```

### Code Review Checklist

Before requesting review, ensure:

- [ ] Code follows project style guide
- [ ] Tests pass: `npm run test`
- [ ] No console errors: `npm run build`
- [ ] Changes are well-documented
- [ ] Commit messages are clear
- [ ] Related issue is referenced

### Syncing with main/develop

**Keep feature branch updated:**

```bash
# Fetch latest changes
git fetch origin

# Rebase on develop
git rebase origin/develop

# If conflicts occur, resolve them
git status  # See conflicts
# Edit conflicting files
git add .
git rebase --continue

# Force push (only on feature branch!)
git push -f origin feature/add-marketplace
```

### Merging Pull Request

After approval:

```bash
# Option 1: Squash commits (cleaner history)
git checkout develop
git pull origin develop
git merge --squash feature/add-marketplace
git commit -m "feat(marketplace): add listing component"
git push origin develop

# Option 2: Rebase merge (linear history)
git merge --rebase feature/add-marketplace
git push origin develop

# Delete feature branch
git branch -d feature/add-marketplace
git push origin -d feature/add-marketplace
```

---

## Troubleshooting Common Issues

### "CORS policy: No 'Access-Control-Allow-Origin' header"

**Problem:** Frontend cannot reach backend due to CORS error.

**Solutions:**
1. Verify backend is running: `curl http://localhost:4000/api/health`
2. Check `.env` FRONTEND_URL matches browser origin (e.g., `http://localhost:5173`)
3. Restart backend after changing `.env`
4. Check browser DevTools Network tab for preflight OPTIONS request

**Debug:**
```bash
# Test CORS
curl -i -X OPTIONS http://localhost:4000/api/health \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
# Should return: Access-Control-Allow-Origin header
```

See [CORS Configuration](./INTEGRATION_SETUP.md#cors-configuration) for detailed troubleshooting.

### "MongoDB connection refused"

**Problem:** Backend cannot connect to MongoDB.

**Solutions:**
1. Start MongoDB: `mongod` or `brew services start mongodb-community`
2. Check MONGO_URI in `.env`: should be `mongodb://localhost:27017/mallchain_dev`
3. Verify MongoDB is running: `mongo --eval "db.adminCommand('ping')"`
4. Check port: `lsof -i :27017` (should show mongod)

**Restart MongoDB:**
```bash
# macOS
brew services restart mongodb-community

# Linux
sudo systemctl restart mongod

# or kill and restart
pkill mongod
mongod
```

### "Redis connection refused"

**Problem:** Backend cannot connect to Redis.

**Solutions:**
1. Start Redis: `redis-server` or `brew services start redis`
2. Check REDIS_HOST and REDIS_PORT in `.env`
3. Verify Redis is running: `redis-cli ping` (should return PONG)
4. Check port: `lsof -i :6379` (should show redis-server)

**Restart Redis:**
```bash
# macOS
brew services restart redis

# Linux
sudo systemctl restart redis-server

# or kill and restart
pkill redis-server
redis-server
```

### "Port 4000 already in use"

**Problem:** Another process is using port 4000.

**Solutions:**
```bash
# Find process using port 4000
lsof -i :4000

# Kill the process
kill -9 <PID>

# Or force kill all Node processes
pkill -f "node"

# Or use the cleanup script
fuser -k 4000/tcp
```

### "Module not found" or "Cannot find package"

**Problem:** Dependencies not installed or out of sync.

**Solutions:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Or use npm ci for exact versions
npm ci
```

### Frontend shows "Unable to connect to server"

**Problem:** Frontend cannot reach backend API.

**Debugging:**
1. Check backend is running: `curl http://localhost:4000/api/health`
2. Check frontend `.env`: `VITE_API_BASE_URL=http://localhost:4000`
3. Check browser console (F12) for network errors
4. Check Network tab in DevTools to see failed requests
5. Verify CORS is configured correctly

**Check if demo mode is enabled:**
```bash
# Frontend .env should have:
VITE_API_BASE_URL=http://localhost:4000
# NOT empty (which would enable demo mode)
```

### "Authentication failed" or "Invalid token"

**Problem:** JWT token is invalid or expired.

**Solutions:**
1. Clear localStorage and login again
2. Check JWT_SECRET in backend `.env` is at least 32 characters
3. Verify token is stored correctly:
   ```javascript
   // In browser console
   localStorage.getItem('auth_token')
   ```
4. Token expires after sessionTtlMin (default 120 min) — login again
5. Check token format: should be `Bearer eyJ...` in Authorization header

### Socket.IO not connecting

**Problem:** Real-time updates not working.

**Solutions:**
1. Check backend is running and Socket.IO is initialized
2. Verify backend logs show "Socket.IO server ready"
3. Check browser console for connection errors
4. Verify CORS is configured for Socket.IO
5. Check firewall allows WebSocket connections (port 4000)

**Test Socket.IO:**
```javascript
// In browser console
console.log(window.socket?.id);  // Should show socket ID if connected
window.socket?.on('connect', () => console.log('Socket connected'));
window.socket?.on('connect_error', (error) => console.error(error));
```

### "Blockchain RPC not responding"

**Problem:** Backend cannot connect to blockchain node.

**Solutions:**
1. Start blockchain node: `./marketplaced start ...`
2. Verify CHAIN_RPC in `.env`: should be `http://localhost:26657`
3. Test RPC directly: `curl http://localhost:26657/health`
4. Check firewall allows port 26657 and 1317

**Restart blockchain:**
```bash
# Kill existing process
pkill -f "marketplaced start"

# Start fresh
./marketplaced start \
  --home=./blockchain_working \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

### "Not enough disk space"

**Problem:** Docker or blockchain node running out of space.

**Solutions:**
```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a

# Clean up blockchain data (loses local testnet data)
rm -rf ~/.marketplace_test

# Clean up npm cache
npm cache clean --force
```

### "Out of memory" errors

**Problem:** Process running out of RAM.

**Solutions:**
1. Close other applications
2. Increase Node.js memory:
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 npm run dev
   ```
3. Reduce concurrent operations
4. Check for memory leaks in code

### Tests timeout

**Problem:** Tests are running too slowly or hanging.

**Solutions:**
```bash
# Increase timeout
npm run test -- --testTimeout=20000

# Run tests serially (slower but less memory)
npm run test -- --maxWorkers=1

# Run specific test file
npm run test -- api.test.ts
```

### "Hot reload not working"

**Problem:** Changes to code don't automatically reload in browser.

**Solutions:**
1. Restart dev server: `Ctrl+C` then `npm run dev`
2. Check file watcher limit:
   ```bash
   # macOS
   ulimit -n
   # If < 2048, increase it
   ulimit -n 4096
   ```
3. Hard refresh browser: `Cmd+Shift+R` or `Ctrl+Shift+R`

---

## Quick Reference: API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/register` | User registration | No |
| POST | `/api/auth/logout` | User logout | Yes |
| GET | `/api/auth/me` | Current user info | Yes |

### Wallet & Balance

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/wallets/:address/balances` | Get account balance | No |
| GET | `/api/wallets/:address/history` | Transaction history | No |
| POST | `/api/wallets/import` | Import wallet | Yes |
| GET | `/api/wallets/export` | Export wallet | Yes |

### Transactions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/tx` | Send transaction | Yes |
| GET | `/api/tx/:txHash` | Get tx status | No |
| GET | `/api/transactions/:address` | Address tx history | No |

### Blockchain

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Service health | No |
| GET | `/api/ready` | Ready for traffic | No |
| GET | `/api/live` | Alive check | No |
| GET | `/api/validators` | Validator list | No |
| GET | `/api/explorer/blocks` | Block explorer | No |

### Marketplace

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/market` | List products | No |
| POST | `/api/market` | Create listing | Yes |
| GET | `/api/market/:id` | Get product | No |
| POST | `/api/market/:id/buy` | Buy product | Yes |

### Staking

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/staking/:address` | Staking info | No |
| POST | `/api/staking/delegate` | Delegate MALL | Yes |
| POST | `/api/staking/undelegate` | Undelegate MALL | Yes |
| GET | `/api/staking/:address/rewards` | Claim rewards | Yes |

### Real-Time (Socket.IO)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `connection` | ← | socket info | Client connected |
| `subscribe:wallet` | → | address | Listen to wallet changes |
| `wallet:update` | ← | wallet data | Wallet changed |
| `subscribe:blocks` | → | — | Listen to new blocks |
| `block:new` | ← | block data | New block detected |
| `subscribe:market` | → | — | Listen to market activity |
| `market:feed` | ← | events | Market activity |
| `subscribe:price` | → | — | Listen to price updates |
| `price:current` | ← | prices | Price data updated |
| `disconnect` | ← | — | Client disconnected |

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| General APIs | 120 req/min | Per IP |
| Transaction APIs | 40 req/min | Per IP |
| Mines APIs | 100 req/min | Per IP |

---

## FAQ

### Q: How do I switch between demo mode and real backend?

**A:** Edit `.env` in frontend directory:

**Demo mode:**
```ini
VITE_API_BASE_URL=
VITE_DEMO_MODE=true
```

**Real backend:**
```ini
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_MODE=false
```

Then restart frontend: `npm run dev`

### Q: How do I generate JWT_SECRET and SESSION_SECRET?

**A:** Use OpenSSL to generate random 32-character strings:

```bash
openssl rand -base64 32
# Output: aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789==

# Repeat for SESSION_SECRET
openssl rand -base64 32
```

Paste output into `.env` file for both secrets.

### Q: Can I run frontend without backend?

**A:** Yes, use demo mode:
```bash
cd mallchain-os-v14
cp .env.example .env
# Set VITE_API_BASE_URL= (empty) and VITE_DEMO_MODE=true
npm run dev
```

This loads demo data and simulates blockchain activity.

### Q: How do I reset the local blockchain?

**A:** Stop all services and reset data:

```bash
./STOP_ALL.sh

# Reset blockchain
rm -rf blockchain_working

# Reset databases
mongo mallchain_dev --eval "db.dropDatabase()"
redis-cli FLUSHALL

# Restart
./START_ALL.sh
```

### Q: How do I debug why an API call is failing?

**A:** Check these in order:

1. **Backend running?**
   ```bash
   curl http://localhost:4000/api/health
   ```

2. **Network request in DevTools?**
   - Open DevTools (F12)
   - Network tab
   - Look for the failed request
   - Check Status code and response body

3. **Token expired?**
   ```javascript
   // Browser console
   localStorage.getItem('auth_token')
   // If missing or null, login again
   ```

4. **Backend logs?**
   ```bash
   tail -f server.log | grep ERROR
   ```

### Q: How do I add a new environment variable?

**A:** 

1. Add to `.env.example`:
   ```
   NEW_VAR=example_value
   ```

2. Add to `.env`:
   ```
   NEW_VAR=your_actual_value
   ```

3. **Backend:** Access in code:
   ```javascript
   const value = process.env.NEW_VAR;
   ```

4. **Frontend:** Add to Vite config `.env`:
   ```
   VITE_NEW_VAR=value  # Must have VITE_ prefix
   ```
   Then access:
   ```typescript
   const value = import.meta.env.VITE_NEW_VAR;
   ```

### Q: How do I create a test user?

**A:** 

1. **Via frontend UI:** Click Register, fill form, submit
2. **Via API:**
   ```bash
   curl -X POST http://localhost:4000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"TestPass123!","email":"test@example.com"}'
   ```
3. **Via MongoDB CLI:**
   ```bash
   mongo mallchain_dev
   db.users.insertOne({username:"test",email:"test@test.com",passwordHash:"..."})
   ```

### Q: How do I export blockchain data?

**A:** Use provided export endpoints:

```bash
# Export all blocks
curl http://localhost:4000/api/explorer/blocks | jq '.' > blocks.json

# Export transaction history
curl http://localhost:4000/api/transactions/mall1abc123 | jq '.' > txs.json

# Export validator list
curl http://localhost:4000/api/validators | jq '.' > validators.json
```

### Q: How do I contribute code?

**A:** Follow this process:

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -m "feat: my feature"`
3. Push to remote: `git push origin feature/my-feature`
4. Create Pull Request on GitHub
5. Request review from team
6. Address review comments
7. Merge when approved

See [Git Workflow](#git-workflow-and-contribution-guidelines) for details.

### Q: Where can I find API documentation?

**A:** Check these resources:

- **Endpoints:** [API_ENDPOINTS_REFERENCE.md](./API_ENDPOINTS_REFERENCE.md)
- **Specification:** `.kiro/specs/backend-frontend-integration/requirements.md`
- **Design:** `.kiro/specs/backend-frontend-integration/design.md`
- **Setup:** [INTEGRATION_SETUP.md](./INTEGRATION_SETUP.md)
- **Postman Collection:** See backend README for export link

### Q: How do I run tests before committing?

**A:** Use pre-commit hooks:

```bash
# Frontend
cd mallchain-os-v14
npm run test

# Backend
npm run test

# Build check
npm run build
```

All should pass before creating Pull Request.

### Q: How do I monitor performance?

**A:** Use browser DevTools and backend logs:

**Frontend:**
- DevTools → Performance tab
- Record user interaction
- Analyze flame graph
- Look for slow components

**Backend:**
- Enable debug logging: `DEBUG=* npm run dev`
- Monitor response times in logs
- Check database query performance: `db.setProfilingLevel(1)`

### Q: Can I use a different database?

**A:** Yes, but requires changes:

1. Update MONGO_URI in `.env` to point to different MongoDB instance
2. For different database type (PostgreSQL, etc.), would need to:
   - Update backend ORM/driver
   - Migrate schema
   - Update API service queries
   - Test thoroughly

### Q: How do I handle offline mode?

**A:** Frontend already supports it:

1. Socket.IO auto-reconnects when connection restores
2. API calls queue and retry when network returns
3. Implement local cache for offline use:
   ```typescript
   // Store data in IndexedDB for offline access
   ```

Detailed offline support is on the roadmap.

### Q: Where do I report bugs?

**A:** 

1. Create issue on GitHub with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/OS version
   - Error logs

2. Or contact: support@mallchain.io

---

## Getting Help

- **Documentation:** Check files in `/docs` directory
- **Design Docs:** `.kiro/specs/backend-frontend-integration/design.md`
- **Architecture:** `INTEGRATION_ARCHITECTURE.md`
- **Setup Issues:** `INTEGRATION_SETUP.md` → Troubleshooting section
- **Security:** `SECURITY_BEST_PRACTICES.md`
- **GitHub Issues:** Create issue with detailed information
- **Discord:** Join community chat for quick questions
- **Email:** contact@mallchain.dev

---

**Happy coding! 🚀**

Last updated: 2024
Version: 1.0
