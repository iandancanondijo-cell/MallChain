/**
 * Wallet Widget Component
 * Display wallet info in e-commerce profile/checkout
 * Can be placed anywhere in the app when wallet is accessible
 */

import React from 'react';
import { useWalletIntegration } from '../shared/walletIntegration';
import { Wallet, AlertCircle } from 'lucide-react';

export default function WalletWidget() {
  const { 
    walletAddress, 
    walletBalance, 
    mallcoins, 
    mallpoints,
    isWalletConnected 
  } = useWalletIntegration();

  if (!isWalletConnected) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-yellow-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <p className="text-yellow-400 font-bold text-sm">Wallet Not Connected</p>
        </div>
        <p className="text-slate-400 text-xs">Connect your wallet to see balance and use wallet payments</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-lg border border-indigo-500/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-5 h-5 text-indigo-400" />
        <p className="text-slate-300 font-bold text-sm">Wallet Balance</p>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Address:</span>
          <p className="text-xs text-slate-300 font-mono">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </p>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Balance:</span>
          <p className="text-lg font-bold text-green-400">{walletBalance} KES</p>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-700">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">MallCoins</span>
            <p className="text-sm font-bold text-blue-400">{mallcoins}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Points</span>
            <p className="text-sm font-bold text-purple-400">{mallpoints}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
