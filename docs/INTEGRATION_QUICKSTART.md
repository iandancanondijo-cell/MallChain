# Integration Architecture Quick Reference

## Quick Start

### Frontend Setup
```bash
cd mallchain-os-v14
cp .env.example .env
# Set VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev
# Available at http://localhost:5173
```

### Backend Setup
```bash
cd backend
cp .env.example .env
# Configure environment variables
npm install
npm start
# Listening on port 4000
```

## Key URLs

| Component | URL | Purpose |
|-----------|-----|---------|
| Frontend | http://localhost:5173 | React application |
| Backend | http://localhost:4000 | REST API & WebSocket |
| Health Check | http://localhost:4000/api/health | Backend status |
| WebSocket | ws://localhost:4000 | Real-time updates |

## Environment Variables

### Frontend (.env)
```bash
VITE_API_BASE_URL=http://localhost:4000    # Backend URL (empty = demo mode)
VITE_DEMO_MODE=false                       # Use local store if true
VITE_NETWORK=testnet                       # 'mainnet' or 'testnet'
VITE_SESSION_TTL=120                       # JWT expiration minutes
```

### Backend (.env)
```bash
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb://localhost:27017/mallchain
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-32-chars-minimum
SESSION_SECRET=your-secret-32-chars-minimum
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:3000
CHAIN_RPC=http://localhost:26657
CHAIN_REST=http://localhost:1317
```

## API Patterns

### Successful Request
```
GET /api/wallets/mall1abc.../balances
Authorization: Bearer {token}

Response:
{
  "ok": true,
  "data": {
    "address": "mall1abc...",
    "balances": {"umalc": 1000000}
  }
}
```

### Error Response
```
{
  "ok": false,
  "error": "Not authorized",
  "code": 401
}
```

## Authentication Flow

1. User logs in → POST /api/auth/login
2. Backend returns JWT token
3. Frontend stores: localStorage.setItem('token', jwt)
4. Subsequent requests include: Authorization: Bearer {token}
5. Token expires after sessionTtlMin → 403 response
6. Frontend clears token and redirects to login

## WebSocket Events

### Subscribe
```javascript
socket.emit('subscribe:wallet', 'mall1abc...');
socket.emit('subscribe:market');
socket.emit('subscribe:blocks');
socket.emit('subscribe:price');
```

### Listen
```javascript
socket.on('wallet:update', (data) => {...});
socket.on('block:new', (data) => {...});
socket.on('market:feed', (data) => {...});
socket.on('price:current', (data) => {...});
```

## Common Issues

| Issue | Solution |
|-------|----------|
| CORS error | Check FRONTEND_URL in backend .env |
| "Failed to fetch" | Verify backend running and VITE_API_BASE_URL set |
| 401 Unauthorized | Clear localStorage, log in again |
| WebSocket not connecting | Check backend listening, CORS configured |
| Rate limit (429) | Wait 60 seconds, reduce request frequency |

## Endpoint Reference

### Authentication
- POST /api/auth/login - User login
- POST /api/auth/register - User registration
- POST /api/auth/logout - User logout

### Blockchain Data
- GET /api/wallets/:address/balances - Wallet balances
- GET /api/transactions/:address - Transaction history
- GET /api/validators - Validator list
- GET /api/explorer/blocks - Block explorer

### Transactions
- POST /api/tx - Send transaction
- GET /api/tx/:txHash - Transaction status

### Marketplace
- GET /api/market - List items
- POST /api/market - Create listing
- POST /api/market/:id/buy - Buy item

## Monitoring

Check backend health:
```bash
curl http://localhost:4000/api/health
```

Response includes:
- Backend status
- MongoDB connection status
- Redis connection status
- Blockchain chain status

## File Locations

- Backend: `/backend/src/`
- Frontend: `/mallchain-os-v14/src/`
- API Service: `/mallchain-os-v14/src/services/api.ts`
- Socket Manager: `/mallchain-os-v14/src/services/socket.ts`
- Config: `/mallchain-os-v14/src/config/index.ts`

## Full Documentation

See [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) for comprehensive documentation including:
- Detailed component interactions
- Data flow diagrams
- Security architecture
- Performance optimization
- Deployment configurations
- Troubleshooting guide
- Testing strategies

