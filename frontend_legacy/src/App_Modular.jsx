/**
 * Main App Component
 * Routes to either Wallet, E-Commerce, or Full App based on configuration
 * Wraps everything with shared WalletProvider for cross-module state
 */

import React, { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { WalletProvider } from './shared/WalletContext';
import { appConfig, isModuleEnabled, isAppMode } from './config/appConfig';
import { Toaster } from 'sonner';

// Import routers
import WalletRouter from './routers/WalletRouter';
import ECommerceRouter from './routers/ECommerceRouter';

// Full app router (both modules combined)
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Full Router with all routes
const FullRouter = () => {
  const walletRoutes = WalletRouter();
  const ecommerceRoutes = ECommerceRouter();

  return (
    <Routes>
      {/* E-Commerce at root */}
      <Route path="/*" element={<ECommerceRouter />} />
      {/* Wallet under /wallet prefix */}
      <Route path="/wallet/*" element={<WalletRouter />} />
    </Routes>
  );
};

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-950">
    <div className="text-center">
      <div className="text-white text-2xl font-bold mb-4">Marketplace</div>
      <div className="text-slate-400">Loading...</div>
    </div>
  </div>
);

export default function App() {
  // Determine which router to use based on config
  const getActiveRouter = () => {
    if (isAppMode('wallet')) {
      return <WalletRouter />;
    } else if (isAppMode('ecommerce')) {
      return <ECommerceRouter />;
    } else {
      // Default: full app with both modules
      return <FullRouter />;
    }
  };

  return (
    <WalletProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          {getActiveRouter()}
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </BrowserRouter>
    </WalletProvider>
  );
}
