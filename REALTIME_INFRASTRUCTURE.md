# Phase 2: Realtime Infrastructure Roadmap

## Overview
This phase implements a complete real-time infrastructure using Socket.IO, enabling live wallet updates, market activity feeds, price streaming, and blockchain event notifications.

## Architecture

```
Blockchain
    ↓
Event Listener (backend/services/blockListener.js)
    ↓
Socket.IO Server (backend/src/index.js)
    ↓
Event Processors (priceEngine, marketFeed, walletSync, etc.)
    ↓
Socket.IO Client (frontend/src/lib/socket.ts)
    ↓
React Components (LivePriceChart, LiveMarketActivityFeed, etc.)
```

## Implemented Components

### Backend Services

1. **blockListener.js** - Polls blockchain for new blocks and transactions
   - Emits `block:new` events
   - Processes transaction results
   - Updates blockchain height tracking

2. **priceEngine.js** - Real-time price simulation
   - Tracks buy/sell volume
   - Calculates price impact
   - Maintains price history
   - Emits `price:update` events

3. **marketActivityFeed.js** - Market event tracking
   - Logs purchases, swaps, staking, governance, cross-chain events
   - Maintains activity history
   - Emits `market:event` events

4. **walletSync.js** - Real-time wallet synchronization
   - Fetches wallet balances from chain
   - Caches wallet data
   - Emits `wallet:update` events

5. **notificationManager.js** - Push notifications
   - Transaction confirmations/failures
   - Block productions
   - Market events
   - System messages

### Frontend Library & Context

1. **frontend/src/lib/socket.ts** - Socket.IO client initialization
   - Auto-reconnection logic
   - Connection state management
   - Error handling

2. **frontend/src/context/RealtimeContext.tsx** - React context provider
   - Centralized state for all real-time data
   - Event subscription methods
   - `useRealtime()` hook

### Frontend Hooks

**frontend/src/hooks/useRealtime.ts**

- `useLiveWallet(address)` - Subscribe to wallet updates
- `useLiveMarketFeed(limit)` - Stream market activity
- `useLivePrice()` - Get real-time price data
- `useNotifications()` - Listen for notifications
- `useRealtimeStatus()` - Connection status
- `useLiveBlocks()` - New block updates

### Frontend Components

1. **LivePriceChart.tsx** - Animated price chart with Recharts
2. **LiveMarketActivityFeed.tsx** - Real-time activity stream
3. **LiveWalletBalance.tsx** - Live wallet balance display
4. **NotificationCenter.tsx** - Toast notifications

## Integration Steps

### 1. Setup Backend

The backend is already configured. To add real-time features to routes:

```javascript
const { priceEngine } = require('../services/priceEngine')
const { marketFeed } = require('../services/marketActivityFeed')
const { walletSyncService } = require('../services/walletSync')
const { notificationManager } = require('../services/notificationManager')

// After processing a transaction:
priceEngine.processBuy(amount)
marketFeed.addPurchase(buyer, amount, item, price)
walletSyncService.updateWallet(sender)
walletSyncService.updateWallet(receiver)
notificationManager.txConfirmed(txHash, amount, receiver)
```

### 2. Setup Frontend

Wrap your app with RealtimeProvider:

```tsx
import { RealtimeProvider } from './context/RealtimeContext'

function App() {
  return (
    <RealtimeProvider>
      <YourApp />
    </RealtimeProvider>
  )
}
```

### 3. Use Realtime Components

```tsx
import { LivePriceChart } from './components/LivePriceChart'
import { LiveMarketActivityFeed } from './components/LiveMarketActivityFeed'
import { LiveWalletBalance } from './components/LiveWalletBalance'
import { NotificationCenter } from './components/NotificationCenter'

function Dashboard() {
  return (
    <>
      <NotificationCenter />
      <LivePriceChart />
      <LiveMarketActivityFeed />
      <LiveWalletBalance address={walletAddress} />
    </>
  )
}
```

### 4. Use Realtime Hooks

```tsx
import { useLiveWallet, useLivePrice, useLiveMarketFeed } from './hooks/useRealtime'

function MyComponent() {
  const walletData = useLiveWallet(address)
  const price = useLivePrice()
  const feed = useLiveMarketFeed()

  return (
    <div>
      <p>Balance: {walletData?.balances}</p>
      <p>Price: ${price?.price}</p>
      <p>Recent: {feed.length} events</p>
    </div>
  )
}
```

## Environment Variables

Backend (.env):
```
COSMOS_RPC=http://localhost:26657
CHAIN_REST_URL=http://localhost:1317
```

Frontend (.env):
```
VITE_API_URL=http://localhost:4000
```

## Event Types

### block:new
```json
{
  "height": 12345,
  "hash": "...",
  "timestamp": "2024-01-01T12:00:00Z",
  "txCount": 5
}
```

### price:update
```json
{
  "type": "buy",
  "volume": 100,
  "impact": 0.01,
  "price": 1.01,
  "timestamp": 1234567890
}
```

### market:event
```json
{
  "type": "purchase|swap|stake|governance|crosschain",
  "data": { /* event-specific data */ },
  "timestamp": 1234567890
}
```

### wallet:update
```json
{
  "address": "cosmos1...",
  "balances": [
    { "denom": "umal", "amount": "1000000" }
  ],
  "timestamp": 1234567890
}
```

### notification
```json
{
  "type": "success|error|warning|info",
  "title": "Transaction Confirmed",
  "message": "100 MLCOIN transferred",
  "metadata": {}
}
```

## Performance Optimization

1. **Event Batching** - Combine multiple updates before broadcasting
2. **Pagination** - Limit history to last N events (default 100-1000)
3. **Connection Pooling** - Reuse Socket.IO connections
4. **Cache Management** - Clear old events periodically
5. **Selective Updates** - Only broadcast to relevant subscribers

## Next Steps

1. **Phase 3**: Advanced Analytics & AI
   - Price prediction models
   - Market trend analysis
   - User behavior analytics

2. **Scaling**:
   - Redis Pub/Sub for multi-server setup
   - Horizontal scaling with Socket.IO Redis adapter
   - Load balancing

3. **Production Hardening**:
   - Authentication tokens for subscriptions
   - Rate limiting on events
   - Monitoring and alerting
   - Graceful degradation

## Troubleshooting

**Socket not connecting?**
- Check CORS settings in backend
- Verify API_URL in frontend
- Check network connectivity

**Events not being received?**
- Verify RealtimeProvider wraps your app
- Check browser console for errors
- Ensure backend services are running

**Performance issues?**
- Reduce event history limit
- Increase polling interval
- Check network latency
- Monitor backend CPU/memory

## Files Structure

```
backend/
├── services/
│   ├── blockListener.js
│   ├── priceEngine.js
│   ├── marketActivityFeed.js
│   ├── walletSync.js
│   └── notificationManager.js
└── src/
    └── index.js (updated)

frontend/
├── src/
│   ├── lib/
│   │   └── socket.ts
│   ├── context/
│   │   └── RealtimeContext.tsx
│   ├── hooks/
│   │   └── useRealtime.ts
│   └── components/
│       ├── LivePriceChart.tsx
│       ├── LiveMarketActivityFeed.tsx
│       ├── LiveWalletBalance.tsx
│       └── NotificationCenter.tsx
```
