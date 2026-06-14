import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, Copy, Check, AlertCircle, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { useWallet } from '../../shared/WalletContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

/**
 * Validate Cosmos wallet address format
 */
function isValidCosmosAddress(address) {
  return /^(cosmos|mall|tmp)[a-z0-9]{39,}$/.test(address);
}

export default function ConnectWallet() {
  const navigate = useNavigate();
  const { connectWallet, updateBalance } = useWallet();
  const [walletAddress, setWalletAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [connectionMethod, setConnectionMethod] = useState('address'); // 'address' | 'key' | 'seed'
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState('');
  const [copied, setCopied] = useState(false);

  const handleConnect = async (e) => {
    e.preventDefault();
    
    if (!walletAddress && !privateKey && !seedPhrase) {
      toast.error('Please enter wallet credentials');
      return;
    }

    if (connectionMethod === 'key') {
      // Private key connection not yet supported
      toast.error('Private key connection coming soon');
      return;
    }

    setIsConnecting(true);
    try {
      // Prepare request body
      const requestBody = {
        method: connectionMethod,
      };

      // For address method, validate client-side
      if (connectionMethod === 'address') {
        const addressToConnect = walletAddress.trim();
        if (!isValidCosmosAddress(addressToConnect)) {
          toast.error('Invalid Cosmos wallet address. Must start with cosmos, mall, or tmp');
          setIsConnecting(false);
          return;
        }
        requestBody.address = addressToConnect;
      } else if (connectionMethod === 'seed') {
        // For seed phrase, send to backend for derivation
        if (!seedPhrase.trim()) {
          toast.error('Please enter your seed phrase');
          setIsConnecting(false);
          return;
        }
        requestBody.seedPhrase = seedPhrase.trim();
        // Backend will auto-detect prefix from derived address or use 'cosmos'
        requestBody.addressPrefix = 'cosmos';
      }

      // Call backend to connect wallet
      const response = await fetch(`${API_BASE}/api/wallet/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Connection failed');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Connection failed');
      }

      // Store connected wallet in context with real balance
      await connectWallet(data.address, null);
      await updateBalance(
        data.balance.convertedBalance,
        data.balance.mallcoins,
        data.balance.mallpoints
      );

      setConnectedAddress(data.address);
      toast.success('Wallet connected successfully!');

      // Redirect to wallet home after short delay
      setTimeout(() => {
        console.log('[ConnectWallet] Redirecting to /wallet/home');
        console.log('[ConnectWallet] Current walletState:', { isConnected: walletState.isConnected, address: walletState.address });
        navigate('/wallet/home');
      }, 2000);
    } catch (error) {
      console.error('Connection failed:', error);
      toast.error(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(connectedAddress);
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (connectedAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/wallet/home')}
              className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-3xl font-black text-white">Wallet Connected</h1>
            <p className="text-slate-400 text-sm mt-2">Your Mallcoin wallet is now connected</p>
          </div>

          {/* Success Card */}
          <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl border border-green-500/30 p-8 text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-green-400 font-bold text-sm mb-4">Connected Successfully</p>
            
            <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Wallet Address</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-mono text-white break-all">{connectedAddress}</p>
                <button
                  onClick={copyToClipboard}
                  className="flex-shrink-0 p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => navigate('/wallet/home')}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold py-3 rounded-xl hover:from-indigo-500 hover:to-indigo-400 transition-all"
            >
              Go to Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/wallet/home')}
            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-black text-white">Connect Wallet</h1>
          </div>
          <p className="text-slate-400">Connect your Mallcoin wallet to start trading and managing your assets</p>
        </div>

        {/* Connection Methods */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { id: 'address', label: 'Wallet Address', icon: '📍' },
            { id: 'key', label: 'Private Key', icon: '🔑' },
            { id: 'seed', label: 'Seed Phrase', icon: '🌱' },
          ].map((method) => (
            <button
              key={method.id}
              onClick={() => setConnectionMethod(method.id)}
              className={`p-4 rounded-xl border-2 transition-all ${
                connectionMethod === method.id
                  ? 'bg-indigo-500/20 border-indigo-500'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="text-2xl mb-2">{method.icon}</div>
              <p className="text-xs font-bold text-white">{method.label}</p>
            </button>
          ))}
        </div>

        {/* Warning Alert */}
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 mb-8 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-bold text-sm mb-1">Never share your private key or seed phrase</p>
            <p className="text-yellow-300/70 text-xs">Only connect your wallet on trusted devices. We never store your private keys.</p>
          </div>
        </div>

        {/* Connection Form */}
        <form onSubmit={handleConnect} className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-white/10 p-8 mb-8">
          <div className="space-y-6">
            {connectionMethod === 'address' && (
              <div>
                <label className="block text-sm font-bold text-white mb-2">Wallet Address</label>
                <input
                  type="text"
                  placeholder="cosmos1abc123...def456"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors"
                />
                <p className="text-xs text-slate-500 mt-2">Your Cosmos or Mallchain wallet address starting with 'cosmos' or 'mall'</p>
              </div>
            )}

            {connectionMethod === 'key' && (
              <div>
                <label className="block text-sm font-bold text-white mb-2">Private Key</label>
                <textarea
                  placeholder="Your hex-encoded private key..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors resize-none font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">Your private key will never be stored on servers</p>
              </div>
            )}

            {connectionMethod === 'seed' && (
              <div>
                <label className="block text-sm font-bold text-white mb-2">Seed Phrase (12 or 24 words)</label>
                <textarea
                  placeholder="word1 word2 word3 word4..."
                  value={seedPhrase}
                  onChange={(e) => setSeedPhrase(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors resize-none"
                />
                <p className="text-xs text-slate-500 mt-2">Enter your 12 or 24 word recovery phrase separated by spaces</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isConnecting}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </>
              )}
            </button>
          </div>
        </form>

        {/* Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Secure', desc: 'Keys never leave your device' },
            { title: 'Fast', desc: 'Connect in seconds' },
            { title: 'Compatible', desc: 'Works with Cosmos & Mallchain' },
          ].map((item) => (
            <div key={item.title} className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
              <p className="text-white font-bold text-sm mb-1">{item.title}</p>
              <p className="text-slate-400 text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
