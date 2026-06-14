# Modular Architecture Documentation

## Overview
The marketplace has been restructured to support **separate wallet and e-commerce modules** that can be deployed independently while remaining connected through shared wallet addresses and keys.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│          WalletProvider (Shared State)                   │
│  - Address, Balance, Mallcoins, Mallpoints               │
│  - User Profile & Roles                                  │
└─────────────────────────────────────────────────────────┘
         ↑                                   ↑
         │                                   │
    ┌────────────┐                   ┌──────────────┐
    │   Wallet   │                   │ E-Commerce   │
    │   Module   │                   │   Module     │
    ├────────────┤                   ├──────────────┤
    │ - Send     │                   │ - Browse     │
    │ - Receive  │                   │ - Cart       │
    │ - Vault    │                   │ - Checkout   │
    │ - Txns     │                   │ - Orders     │
    └────────────┘                   └──────────────┘
         ↕                                ↕
    ┌────────────────────────────────────────┐
    │  Cross-Module Communication Layer      │
    │  - WalletIntegration Service           │
    │  - CrossModuleEvents Emitter           │
    └────────────────────────────────────────┘
```

## Deployment Modes

### 1. Full Application (Default)
Both wallet and e-commerce together in one app.

```bash
npm run dev
# Uses .env or .env.local (full mode)
# Accessible at:
# - E-Commerce: http://localhost:5173/
# - Wallet: http://localhost:5173/wallet
```

### 2. Wallet-Only Mode
Standalone wallet application (microservice).

```bash
npm run dev -- --mode wallet
# Or use env file:
# Copy .env.wallet to .env.local and run npm run dev
```

### 3. E-Commerce-Only Mode
Standalone e-commerce platform (can optionally connect to wallet service).

```bash
npm run dev -- --mode ecommerce
# Or use env file:
# Copy .env.ecommerce to .env.local and run npm run dev
```

## Environment Configuration

### Full Mode (.env)
```
VITE_APP_MODE=full
VITE_ENABLE_WALLET=true
VITE_ENABLE_ECOMMERCE=true
VITE_CROSS_MODULE_WALLET=true
```

### Wallet Mode (.env.wallet)
```
VITE_APP_MODE=wallet
VITE_ENABLE_WALLET=true
VITE_ENABLE_ECOMMERCE=false
```

### E-Commerce Mode (.env.ecommerce)
```
VITE_APP_MODE=ecommerce
VITE_ENABLE_WALLET=false
VITE_ENABLE_ECOMMERCE=true
```

## Shared State Management

### WalletContext (src/shared/WalletContext.jsx)
Central state for wallet information accessible by both modules:

```javascript
import { useWallet } from './shared/WalletContext';

function MyComponent() {
  const { walletState, user, connectWallet, updateBalance } = useWallet();
  
  return (
    <div>
      <p>Balance: {walletState.balance}</p>
      <p>Address: {walletState.address}</p>
    </div>
  );
}
```

## E-Commerce Integration with Wallet

### Display Wallet Balance in E-Commerce
```javascript
import { useWalletIntegration } from './shared/walletIntegration';

function EcommerceProfile() {
  const { walletBalance, walletAddress, isWalletConnected } = useWalletIntegration();
  
  return (
    <div className="profile">
      {isWalletConnected && (
        <div>
          <p>Wallet: {walletAddress}</p>
          <p>Balance: {walletBalance} MallCoins</p>
        </div>
      )}
    </div>
  );
}
```

### Process Wallet Payments in E-Commerce
```javascript
import { WalletPaymentService } from './shared/walletIntegration';

async function checkout(orderId, amount) {
  try {
    const result = await WalletPaymentService.processWalletPayment(
      orderId, 
      amount, 
      userWalletAddress
    );
    // Payment linked via transaction ID
    await linkOrderToTransaction(orderId, result.transactionId);
  } catch (error) {
    console.error('Payment failed', error);
  }
}
```

## Cross-Module Events

Listen for events between modules:

```javascript
import { CrossModuleEvents } from './shared/walletIntegration';

// E-commerce listening for wallet updates
CrossModuleEvents.on('wallet:balanceUpdated', (data) => {
  console.log('New balance:', data.newBalance);
  updateUserBalance(data.newBalance);
});

// Wallet emitting events
CrossModuleEvents.emit('wallet:paymentCompleted', {
  orderId: '123',
  transactionId: 'tx-456',
  amount: 100
});
```

## Type Definitions

Shared types for both modules: `src/shared/types.ts`

- `WalletState` - Wallet data structure
- `UserProfile` - User with both wallet and e-commerce info
- `ECommerceProfile` - E-commerce specific user data
- `Order` - Order with wallet transaction linking
- `WalletProfile` - Wallet specific user data

## Directory Structure

```
src/
├── routers/
│   ├── WalletRouter.jsx          # Wallet module routes
│   └── ECommerceRouter.jsx       # E-Commerce module routes
├── shared/
│   ├── WalletContext.jsx         # Shared state provider
│   ├── walletIntegration.js      # Cross-module API
│   └── types.ts                  # Shared type definitions
├── config/
│   └── appConfig.js              # Configuration management
├── pages/
│   ├── Wallet/                   # Wallet module pages
│   ├── Buyer/                    # E-Commerce buyer pages
│   ├── Seller/                   # E-Commerce seller pages
│   ├── Creator/                  # E-Commerce creator pages
│   └── ...
└── App_Modular.jsx              # Modular App (uses config)
```

## Migration from Single Project

Old structure:
```
- All routes in one App.jsx
- Mixed wallet and e-commerce logic
- No clear separation
```

New structure:
```
- Separate routers per module
- Shared context for cross-module state
- Environment-based routing
- Can deploy as monolith or microservices
```

## Future Enhancements

1. **Microservices Deployment**: Each module can become a separate backend service
2. **Payment Gateway Integration**: wallet payments for e-commerce orders
3. **Transaction History**: Cross-view transaction tracking
4. **Balance Sync**: Real-time balance updates between modules
5. **API Gateway**: Central API that routes to appropriate service

## Testing

Run specific module tests:

```bash
# Test full app
npm test

# Test wallet module only
VITE_APP_MODE=wallet npm test

# Test e-commerce module only
VITE_APP_MODE=ecommerce npm test
```

## Troubleshooting

**Q: Wallet balance not showing in e-commerce?**
- Check `VITE_CROSS_MODULE_WALLET=true` in .env
- Verify wallet is connected in WalletContext
- Check browser console for errors

**Q: Can't run wallet separately?**
- Use `.env.wallet` file
- Ensure `VITE_ENABLE_ECOMMERCE=false`

**Q: E-Commerce checkout fails with wallet payment?**
- Verify wallet module is accessible
- Check backend endpoint configuration
- Review wallet payment service URL
