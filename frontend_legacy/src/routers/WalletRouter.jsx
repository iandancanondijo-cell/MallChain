/**
 * Router Configuration for WALLET MODULE
 * Can be used independently or as part of the full app
 */

import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Wallet Pages
import CreateWallet from '../pages/CreateWallet';
import CreateWalletSession from '../pages/CreateWalletSession';
import RestoreWalletSession from '../pages/RestoreWalletSession';
import RestoreWallet from '../pages/RestoreWallet';
import Dashboard from '../pages/Dashboard';
import Wallet from '../pages/Wallet';
import Transactions from '../pages/Transactions';
import Vault from '../pages/Vault';
import Send from '../pages/Send';
import Receive from '../pages/Receive';
import BlockchainExplorer from '../pages/BlockchainExplorer';
import Confirm from '../pages/Confirm';
import HardwareWallet from '../pages/HardwareWallet';
import Home from '../pages/Home';
import ConnectWallet from '../pages/Wallet/ConnectWallet';

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-900">
    <div className="text-white">Loading Wallet...</div>
  </div>
);

export default function WalletRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Dashboard />} />
        
        {/* Wallet Setup */}
        <Route path="/create" element={<CreateWallet />} />
        <Route path="/create-session" element={<CreateWalletSession />} />
        <Route path="/restore-session" element={<RestoreWalletSession />} />
        <Route path="/restore" element={<RestoreWallet />} />
        
        {/* Main Wallet Routes */}
        <Route path="/overview" element={<Home />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/connect" element={<ConnectWallet />} />
        
        {/* Wallet Operations */}
        <Route path="/send" element={<Send />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/confirm" element={<Confirm />} />
        
        {/* Utilities */}
        <Route path="/blockchain" element={<BlockchainExplorer />} />
        <Route path="/hardware-wallet" element={<HardwareWallet />} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
