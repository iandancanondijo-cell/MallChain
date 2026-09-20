/**
 * Mallchain App - Primary Entry Point
 * Comprehensive user-facing gateway for the independent Mallchain blockchain
 */

import React, { useState, useEffect } from 'react';
import { walletService } from './services/walletService';
import { mallchainClient } from './blockchain/client';
import type { MallchainWallet } from './wallet/MallchainWallet';
import type { MallchainNetworkId } from './types/blockchain';

// Components
import { NetworkSelector } from './components/NetworkSelector';
import { NetworkStatusBadge } from './components/NetworkStatusBadge';
import { WalletModal } from './components/WalletModal';
import { UnlockModal } from './components/UnlockModal';
import { DappApprovalModal } from './components/DappApprovalModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TvRemoteGuide } from './components/TvRemoteGuide';
import { TvKioskCompanionModal } from './components/TvKioskCompanionModal';
import { MobileBottomNav } from './components/MobileBottomNav';

// Hooks
import { useDeviceDetect } from './hooks/useDeviceDetect';
import { useTvRemoteNavigation } from './hooks/useTvRemoteNavigation';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { SendPage } from './pages/SendPage';
import { ReceivePage } from './pages/ReceivePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ExplorerPage } from './pages/ExplorerPage';
import { ValidatorsPage } from './pages/ValidatorsPage';
import { ContractsPage } from './pages/ContractsPage';
import { DappPortalPage } from './pages/DappPortalPage';
import { TestRunnerPage } from './pages/TestRunnerPage';
import { SettingsPage } from './pages/SettingsPage';
import { DeviceCompatibilityPage } from './pages/DeviceCompatibilityPage';

// Task 2: MallchainDashboard (New Dark Glassmorphism Dashboard)
import { MallchainDashboard } from './layouts/MallchainDashboard';

// Icons
import {
  ShieldCheck,
  LayoutDashboard,
  Send,
  Download,
  History,
  Compass,
  Coins,
  FileCode2,
  Globe,
  Settings,
  ChevronDown,
  Lock,
  Unlock,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Menu,
  X,
  CheckCircle2,
  Tv,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [wallet, setWallet] = useState<MallchainWallet | null>(walletService.getActiveWallet());
  const [networkId, setNetworkId] = useState<MallchainNetworkId>(mallchainClient.getNetworkId());
  
  // Feature Flag: Toggle between old and new dashboard (Task 2)
  const [useMallchainDashboard] = useState(true);
  
  // Cross-Device & Smart TV Detection
  const device = useDeviceDetect();
  const [tvKioskOpen, setTvKioskOpen] = useState(false);

  // TV Remote & Spatial D-Pad Navigation Listener
  useTvRemoteNavigation({
    enabled: true,
    onBack: () => {
      if (tvKioskOpen) {
        setTvKioskOpen(false);
      } else if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
      }
    },
  });

  // Modals
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Send pre-fill
  const [sendAsset, setSendAsset] = useState<string>('MLCNS');

  useEffect(() => {
    const unsubWallet = walletService.subscribe(() => {
      setWallet(walletService.getActiveWallet());
    });
    const unsubNetwork = mallchainClient.subscribe(() => {
      setNetworkId(mallchainClient.getNetworkId());
    });
    return () => {
      unsubWallet();
      unsubNetwork();
    };
  }, []);

  const handleNetworkChange = (id: MallchainNetworkId) => {
    mallchainClient.switchNetwork(id);
    setNetworkId(id);
  };

  const handleOpenSend = (asset = 'MLCNS') => {
    setSendAsset(asset);
    setActiveTab('send');
  };

  const handleLockToggle = () => {
    if (!wallet) return;
    if (wallet.locked) {
      setUnlockModalOpen(true);
    } else {
      walletService.lockActive();
    }
  };

  const accounts = walletService.getAccounts();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'receive', label: 'Receive', icon: Download },
    { id: 'transactions', label: 'Activity', icon: History },
    { id: 'explorer', label: 'Explorer', icon: Compass },
    { id: 'validators', label: 'Validators & Staking', icon: ShieldCheck },
    { id: 'contracts', label: 'Smart Contracts', icon: FileCode2 },
    { id: 'dapp', label: 'dApp Portal', icon: Globe },
    { id: 'tests', label: 'Verification (11 Tests)', icon: CheckCircle2 },
    { id: 'devices', label: 'Devices & TV', icon: Tv },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Main Navigation Header - Hidden when using MallchainDashboard */}
      {!useMallchainDashboard && (
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2.5 group text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                M
              </div>
              <div>
                <div className="font-display font-bold text-sm sm:text-base text-slate-100 tracking-tight flex items-center gap-1.5">
                  <span>MALLCHAIN</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/40">
                    GATEWAY
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                  Native Independent Blockchain
                </div>
              </div>
            </button>
          </div>

          {/* Right Header Controls: Network Selector, Node Diagnostic Badge, Wallet Pill */}
          <div className="flex items-center gap-2 sm:gap-3">
            <NetworkSelector
              currentNetworkId={networkId}
              onNetworkChange={handleNetworkChange}
            />

            <NetworkStatusBadge />

            {/* Wallet Pill / Account Menu */}
            {wallet ? (
              <div className="relative">
                <button
                  id="btn-account-pill"
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700/70 bg-slate-900/80 hover:bg-slate-800 transition-colors text-xs text-slate-200"
                >
                  <div className={`w-2 h-2 rounded-full ${wallet.locked ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className="font-medium max-w-[90px] sm:max-w-[120px] truncate">{wallet.name}</span>
                  <span className="font-mono text-slate-500 text-[10px] hidden md:inline">
                    ({wallet.address.slice(0, 6)}...{wallet.address.slice(-4)})
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {accountDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAccountDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95">
                      <div className="p-2 border-b border-slate-800">
                        <div className="text-[10px] uppercase font-mono text-slate-500">Active Account</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">{wallet.name}</div>
                        <div className="text-[11px] font-mono text-cyan-300 break-all select-all mt-1">
                          {wallet.address}
                        </div>
                      </div>

                      {/* Lock / Unlock session toggle */}
                      <div className="py-2 px-1 border-b border-slate-800">
                        <button
                          onClick={() => {
                            setAccountDropdownOpen(false);
                            handleLockToggle();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                        >
                          {wallet.locked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Unlock Wallet Session</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                              <span>Lock Wallet Session</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Account Switching */}
                      {accounts.length > 1 && (
                        <div className="py-2 px-1 border-b border-slate-800">
                          <div className="text-[10px] uppercase font-mono text-slate-500 px-2 mb-1">
                            Switch Account
                          </div>
                          {accounts.map((acc) => (
                            <button
                              key={acc.address}
                              onClick={() => {
                                walletService.switchAccount(acc.address);
                                setAccountDropdownOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                                acc.address === wallet.address
                                  ? 'bg-cyan-950/40 text-cyan-300 font-semibold'
                                  : 'hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              <span className="truncate">{acc.name}</span>
                              <span className="font-mono text-[10px] text-slate-500">{acc.address.slice(0, 6)}...</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Add account button */}
                      <div className="pt-2 px-1">
                        <button
                          onClick={() => {
                            setAccountDropdownOpen(false);
                            setWalletModalOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create or Import Account</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                id="btn-header-connect-wallet"
                onClick={() => setWalletModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-lg shadow-cyan-500/20"
              >
                Access Wallet
              </button>
            )}

            {/* Install PWA Button */}
            <PWAInstallButton variant="header" />

            {/* TV Kiosk & 10-Foot UI Launcher Button */}
            <button
              id="btn-header-tv-mode"
              onClick={() => setTvKioskOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700/70 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs transition-colors cursor-pointer"
              title="Launch Smart TV Display & Retail Kiosk"
            >
              <Tv className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline">TV Mode</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 lg:hidden"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden lg:block border-t border-slate-800/50 bg-slate-950/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-950 p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-left ${
                    isActive
                      ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/40'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-8">
        {/* Task 2: MallchainDashboard (New Dark Glassmorphism Dashboard) */}
        {useMallchainDashboard ? (
          <MallchainDashboard />
        ) : (
          /* Legacy Dashboard */
          <>
            {activeTab === 'dashboard' && (
              <DashboardPage
                wallet={wallet}
                onNavigate={(page) => setActiveTab(page)}
                onOpenReceive={() => setActiveTab('receive')}
                onOpenSend={handleOpenSend}
                onOpenUnlock={() => setUnlockModalOpen(true)}
                onOpenCreateWallet={() => setWalletModalOpen(true)}
              />
            )}

            {activeTab === 'send' && (
              <SendPage
                wallet={wallet}
                initialAsset={sendAsset}
                onNavigate={(page) => setActiveTab(page)}
                onOpenUnlock={() => setUnlockModalOpen(true)}
              />
            )}

            {activeTab === 'receive' && (
              <ReceivePage wallet={wallet} />
            )}

            {activeTab === 'transactions' && (
              <TransactionsPage
                wallet={wallet}
                onNavigate={(page) => setActiveTab(page)}
              />
            )}

            {activeTab === 'explorer' && (
              <ExplorerPage onNavigate={(page) => setActiveTab(page)} />
            )}

            {activeTab === 'validators' && (
              <ValidatorsPage
                wallet={wallet}
                onOpenUnlock={() => setUnlockModalOpen(true)}
              />
            )}

            {activeTab === 'contracts' && (
              <ContractsPage
                wallet={wallet}
                onOpenUnlock={() => setUnlockModalOpen(true)}
              />
            )}

            {activeTab === 'dapp' && (
              <DappPortalPage />
            )}

            {activeTab === 'tests' && (
              <TestRunnerPage />
            )}

            {activeTab === 'devices' && (
              <DeviceCompatibilityPage
                onOpenTvKiosk={() => setTvKioskOpen(true)}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsPage
                wallet={wallet}
                onOpenUnlock={() => setUnlockModalOpen(true)}
                onOpenCreateWallet={() => setWalletModalOpen(true)}
                onNavigate={(page) => setActiveTab(page)}
              />
            )}
          </>
        )}
      </main>

      {/* Footer - Hidden when using MallchainDashboard */}
      {!useMallchainDashboard && (
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Mallchain Protocol Engine</span>
            <span className="text-slate-600">|</span>
            <span className="font-mono text-slate-400">Native Chain ID: {mallchainClient.getNetwork().chainId}</span>
          </div>
          <div className="text-[11px] text-slate-600">
            Zero-knowledge client-side cryptography. Mallchain is an independent sovereign blockchain network.
          </div>
        </div>
        </footer>
      )}

      {/* Global Modals */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        onSuccess={() => {
          setWallet(walletService.getActiveWallet());
          setActiveTab('dashboard');
        }}
      />

      <UnlockModal
        isOpen={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        onSuccess={() => {
          setWallet(walletService.getActiveWallet());
        }}
      />

      <DappApprovalModal />

      {/* Smart TV Kiosk & Companion Modal */}
      <TvKioskCompanionModal
        isOpen={tvKioskOpen}
        onClose={() => setTvKioskOpen(false)}
        wallet={wallet}
      />

      {/* Smart TV Remote D-Pad Guide HUD */}
      <TvRemoteGuide
        isTV={device.isTV}
        tvMode={device.tvMode}
        onToggleTvMode={device.toggleTvMode}
        onOpenKiosk={() => setTvKioskOpen(true)}
      />

      {/* Offline Status Alert */}
      <OfflineIndicator />

      {/* Mobile Bottom Navigation Bar (Smartphones) */}
      <MobileBottomNav
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onOpenMenu={() => setMobileMenuOpen(true)}
      />
    </div>
  );
}
