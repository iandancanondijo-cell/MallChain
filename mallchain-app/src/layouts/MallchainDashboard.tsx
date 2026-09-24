/**
 * MallchainDashboard Component - Root Container
 * Task 2: Dark Glassmorphism Dashboard Implementation
 * 
 * Main dashboard component that manages all state, layouts, and page routing.
 * Implements internal SPA navigation with live network data updates.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/dashboard.css';
import { mallchainClient } from '../blockchain/client';
import { walletService } from '../services/walletService';
import { sendMallcoinTransfer, MallcoinTxError, getNetworkFeeEstimate } from '../services/mallcoinTx';
import { buyApi, type BuyConfig, type BuyQuote } from '../services/buyApi';
import QRCode from 'qrcode';
import type { MallchainWallet } from '../wallet/MallchainWallet';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DashboardState {
  activeSection: string;
  blockHeight: number;
  networkStatus: string; // 'CONNECTED' | 'OFFLINE' | 'LOADING'
  commandPaletteOpen: boolean;
  notificationOpen: boolean;
  userMenuOpen: boolean;
  lightMode: boolean;
  toastVisible: boolean;
  toastMessage: string;
  searchQuery: string;
  // Real data
  wallet: MallchainWallet | null;
  balances: Array<{ denom: string; amount: string; symbol?: string; formatted?: string; name?: string; decimals?: number; isNative?: boolean; usdValueEstimate?: number }>;
  transactions: Array<{ hash: string; type: string; detail: string; when: string; amount: number; unit?: string }>;
  validators: Array<{ name: string; status: string; uptime: string }>;
  loading: boolean;
  error: string | null;
  // UI state for pages/components
  tps: number;
}

interface ActivityFeedItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  icon: string;
  color: 'amber' | 'green' | 'purple' | 'blue' | 'red';
}

interface SlipItem {
  id: string;
  type: string;
  detail: string;
  when: string;
  amount: number;
  unit?: string;
  amountClass: 'amt-pos' | 'amt-neg' | 'amt-warn' | 'amt-info';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a number as a digit strip (e.g., "01523457" for block height)
 */
const digitStrip = (num: number, length: number = 8): string => {
  return String(num).padStart(length, '0');
};

/**
 * Navigation items for sidebar and command palette
 */
const NAVIGATION_ITEMS = [
  // CORE section
  { label: 'Dashboard', id: 'dashboard', section: 'CORE', icon: '📊' },
  { label: 'Wallet Hub', id: 'wallet', section: 'CORE', icon: '💼' },
  { label: 'Send', id: 'send', section: 'CORE', icon: '📤' },
  { label: 'Receive', id: 'receive', section: 'CORE', icon: '📥' },
  { label: 'Buy MALL', id: 'buy', section: 'CORE', icon: '💳' },
  { label: 'Marketplace', id: 'marketplace', section: 'ECOSYSTEM', icon: '🏪' },
  // ECOSYSTEM section
  { label: 'Governance', id: 'governance', section: 'ECOSYSTEM', icon: '🗳️' },
  { label: 'Validators', id: 'validators', section: 'ECOSYSTEM', icon: '✓' },
  { label: 'Explorer', id: 'explorer', section: 'ECOSYSTEM', icon: '🔍' },
  // DEVELOPER section
  { label: 'Smart Contracts', id: 'contracts', section: 'DEVELOPER', icon: '<>' },
  { label: 'DevHub', id: 'devhub', section: 'DEVELOPER', icon: '👨‍💻' },
];

/**
 * Transaction slips - populated from live blockchain data
 */
const INITIAL_SLIPS: SlipItem[] = [];

/**
 * Activity feed - populated from live blockchain data
 */
const INITIAL_ACTIVITY_FEED: ActivityFeedItem[] = [];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MallchainDashboard({ onOpenCreateWallet }: { onOpenCreateWallet?: () => void }) {
  // ========================================================================
  // STATE MANAGEMENT (Task 2.3)
  // ========================================================================

  const [state, setState] = useState<DashboardState>({
    activeSection: 'dashboard',
    blockHeight: 0,
    networkStatus: 'LOADING',
    commandPaletteOpen: false,
    notificationOpen: false,
    userMenuOpen: false,
    lightMode: false,
    toastVisible: false,
    toastMessage: '',
    searchQuery: '',
    wallet: null,
    balances: [],
    transactions: [],
    validators: [],
    loading: true,
    error: null,
    tps: 0,
  });

  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ========================================================================
  // INITIALIZE: Load wallet and real data on mount
  // ========================================================================

  useEffect(() => {
    const updateWallet = () => {
      const wallet = walletService.getActiveWallet();
      setState((prev) => ({ ...prev, wallet }));
    };
    updateWallet();
    // Re-read wallet whenever walletService changes (create/import/switch/lock)
    const unsubscribe = walletService.subscribe(updateWallet);
    return unsubscribe;
  }, []);

  // ========================================================================
  // REAL DATA LOADING: Block height from mallchainClient
  // ========================================================================

  useEffect(() => {
    let isMounted = true;

    const loadNetworkData = async () => {
      try {
        const status = await mallchainClient.getNetworkStatus();
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            blockHeight: status.latestBlock || 0,
            networkStatus: status.status,
            error: null,
          }));
          // Add network status to activity feed on first load
          if (status.status === 'CONNECTED') {
            setActivityFeed((prev) => {
              // Only add if not already present
              if (prev.some((item) => item.title === 'Network Status')) return prev;
              return [
                {
                  id: 'network-status',
                  title: 'Network Status',
                  subtitle: `Connected to ${status.chainId}`,
                  time: 'Just now',
                  icon: '✓',
                  color: 'green' as const,
                },
                ...prev,
              ].slice(0, 5);
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            networkStatus: 'OFFLINE',
            error: err instanceof Error ? err.message : 'Failed to fetch network status',
          }));
        }
      }
    };

    loadNetworkData();
    const interval = setInterval(loadNetworkData, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ========================================================================
  // REAL DATA LOADING: Wallet balances
  // ========================================================================

  useEffect(() => {
    if (!state.wallet?.address) return;

    let isMounted = true;

    const loadBalances = async () => {
      try {
        const balances = await mallchainClient.getBalances(state.wallet!.address);
        if (isMounted) {
          setState((prev) => ({ ...prev, balances, error: null }));
        }
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Failed to fetch balances',
          }));
        }
      }
    };

    loadBalances();
    const interval = setInterval(loadBalances, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [state.wallet?.address]);

  // ========================================================================
  // REAL DATA LOADING: Transaction history
  // ========================================================================

  useEffect(() => {
    if (!state.wallet?.address) return;

    let isMounted = true;

    const loadTransactions = async () => {
      try {
        const txs = await mallchainClient.getTransactions(state.wallet!.address);
        if (isMounted) {
          const formattedTxs = txs.slice(0, 10).map((tx: any) => {
            const isReceive = tx.type === 'receive';
            const counterparty = isReceive ? tx.sender : tx.recipient;
            const shortAddr = counterparty
              ? `${counterparty.slice(0, 10)}…${counterparty.slice(-6)}`
              : '';
            const baseAmount = tx.amount ? parseFloat(tx.amount) / 1_000_000 : 0;
            const unit = tx.denom === 'STAKE' ? ' STAKE' : '';
            // Sign by direction: incoming transfers positive, outgoing negative
            const signedAmount = isReceive ? baseAmount : -baseAmount;
            return {
              hash: tx.hash,
              type: isReceive ? 'Receive' : tx.type === 'send' ? 'Send' : (tx.type || 'Transaction'),
              detail: shortAddr
                ? isReceive
                  ? `From ${shortAddr}`
                  : `To ${shortAddr}`
                : tx.memo || 'On-chain transfer',
              when: tx.timestamp
                ? new Date(tx.timestamp).toLocaleString()
                : 'Time unavailable',
              amount: unit ? signedAmount : parseFloat(signedAmount.toFixed(6)),
              unit,
            };
          });
          setSlips(
            formattedTxs.map((tx) => ({
              id: tx.hash,
              type: tx.type,
              detail: tx.detail,
              when: tx.when,
              amount: tx.amount,
              unit: tx.unit,
              amountClass: (tx.type === 'Receive' ? 'amt-pos' : 'amt-neg') as any,
            }))
          );
          // Generate activity feed from real transactions
          const feedItems: ActivityFeedItem[] = formattedTxs.slice(0, 5).map((tx, i) => ({
            id: tx.hash,
            title: tx.type || 'Transaction',
            subtitle: tx.detail,
            time: tx.when,
            icon: tx.type?.toLowerCase().includes('send') ? '📤' : tx.type?.toLowerCase().includes('receive') ? '📥' : '📋',
            color: (i % 2 === 0 ? 'green' : 'blue') as 'green' | 'blue',
          }));
          if (feedItems.length > 0) {
            setActivityFeed(feedItems);
          }
          setState((prev) => ({ ...prev, transactions: formattedTxs, error: null }));
        }
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Failed to fetch transactions',
          }));
        }
      }
    };

    loadTransactions();
    const interval = setInterval(loadTransactions, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [state.wallet?.address]);

  // ========================================================================
  // REAL DATA LOADING: Validators
  // ========================================================================

  useEffect(() => {
    let isMounted = true;

    const loadValidators = async () => {
      try {
        const validators = await mallchainClient.getValidators();
        if (isMounted) {
          const formattedValidators = validators.slice(0, 5).map((v: any) => ({
            name: v.description?.moniker || 'Validator',
            status: v.jailed ? 'Jailed' : 'Active',
            uptime: `${Number(v.uptime ?? 0).toFixed(1)}%`,
          }));
          setState((prev) => ({ ...prev, validators: formattedValidators, error: null }));
        }
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Failed to fetch validators',
          }));
        }
      }
    };

    loadValidators();
    const interval = setInterval(loadValidators, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ========================================================================
  // KEYBOARD & INTERACTION HANDLERS
  // ========================================================================
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setState((prev) => ({ ...prev, commandPaletteOpen: true }));
      }
      if (e.key === 'Escape') {
        setState((prev) => ({
          ...prev,
          commandPaletteOpen: false,
          notificationOpen: false,
          userMenuOpen: false,
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setState((prev) => ({
          ...prev,
          notificationOpen: false,
          userMenuOpen: false,
        }));
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!state.toastVisible) return;
    const timeout = setTimeout(() => {
      setState((prev) => ({ ...prev, toastVisible: false }));
    }, 2600);
    return () => clearTimeout(timeout);
  }, [state.toastVisible]);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const showToast = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      toastMessage: message,
      toastVisible: true,
    }));
  }, []);

  const goToPage = useCallback((pageId: string) => {
    setState((prev) => ({
      ...prev,
      activeSection: pageId,
      commandPaletteOpen: false,
    }));
    window.scrollTo(0, 0);
  }, []);

  // Get formatted balance in MALL
  const getFormattedBalance = useCallback(() => {
    const mallBalance = state.balances.find((b) => b.denom === 'umall' || b.denom === 'mall');
    if (!mallBalance) return '0.00';
    const amount = parseFloat(mallBalance.amount);
    return (amount / 1_000_000).toFixed(2);
  }, [state.balances]);

  // ========================================================================
  // RENDER - Layout & Content (Task 2.11 + Components)
  // ========================================================================

  return (
    <div
      className={`dashboard-container ${state.lightMode ? 'light' : ''}`}
      style={{
        background: state.lightMode
          ? 'linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%)'
          : 'linear-gradient(135deg, #0a0d13 0%, #0d1017 50%, #1a1d29 100%)',
      }}
    >
      {/* Sidebar */}
      <DashboardSidebar
        activeSection={state.activeSection}
        blockHeight={state.blockHeight}
        onNavigate={goToPage}
        userMenuOpen={state.userMenuOpen}
        onToggleUserMenu={() =>
          setState((prev) => ({ ...prev, userMenuOpen: !prev.userMenuOpen }))
        }
        wallet={state.wallet}
        networkStatus={state.networkStatus}
        onOpenCreateWallet={onOpenCreateWallet}
      />

      {/* Main Content Area */}
      <div className="dashboard-main">
        {/* Header/Topbar */}
        <DashboardHeader
          onSearch={(query) => setState((prev) => ({ ...prev, searchQuery: query }))}
          onOpenCommandPalette={() =>
            setState((prev) => ({ ...prev, commandPaletteOpen: true }))
          }
          onToggleNotifications={() =>
            setState((prev) => ({ ...prev, notificationOpen: !prev.notificationOpen }))
          }
          onToggleTheme={() => setState((prev) => ({ ...prev, lightMode: !prev.lightMode }))}
          notificationOpen={state.notificationOpen}
          lightMode={state.lightMode}
          dropdownRef={dropdownRef}
          networkName={mallchainClient.getNetwork().name}
          networkStatus={state.networkStatus}
          chainId={mallchainClient.getNetwork().chainId}
        />

        {/* Main Content */}
        <div className="dashboard-content">
          <div className="dashboard-main-content">
            {/* Dashboard Page */}
            {state.activeSection === 'dashboard' && (
              <DashboardPage
                blockHeight={state.blockHeight}
                tps={state.tps}
                slips={slips}
                balances={state.balances}
                transactions={state.transactions}
                validators={state.validators}
                networkStatus={state.networkStatus}
                onNavigate={goToPage}
                showToast={showToast}
              />
            )}

            {/* Wallet Page */}
            {state.activeSection === 'wallet' && (
              <WalletPage
                slips={slips}
                balances={state.balances}
                wallet={state.wallet}
                transactions={state.transactions}
                onOpenCreateWallet={onOpenCreateWallet}
              />
            )}

            {/* Send Page */}
            {state.activeSection === 'send' && (
              <SendPage
                wallet={state.wallet}
                showToast={showToast}
                onNavigate={goToPage}
              />
            )}

            {/* Receive Page */}
            {state.activeSection === 'receive' && (
              <ReceivePage showToast={showToast} wallet={state.wallet} balances={state.balances} />
            )}

            {/* Buy Page */}
            {state.activeSection === 'buy' && (
              <BuyPage
                wallet={state.wallet}
                showToast={showToast}
              />
            )}

            {/* Marketplace Page */}
            {state.activeSection === 'marketplace' && <MarketplacePage />}

            {/* Governance Page */}
            {state.activeSection === 'governance' && (
              <GovernancePage showToast={showToast} />
            )}

            {/* Validators Page */}
            {state.activeSection === 'validators' && (
              <ValidatorsPage validators={state.validators} />
            )}

            {/* Explorer Page */}
            {state.activeSection === 'explorer' && (
              <ExplorerPage blockHeight={state.blockHeight} networkName={mallchainClient.getNetwork().name} />
            )}

            {/* Contracts Page */}
            {state.activeSection === 'contracts' && <ContractsPage />}

            {/* DevHub Page */}
            {state.activeSection === 'devhub' && <DevHubPage />}
          </div>

          {/* Right Rail (Dashboard Only) */}
          {state.activeSection === 'dashboard' && (
            <RightRail
              activityFeed={activityFeed}
              onNavigate={goToPage}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {/* Command Palette Modal */}
      {state.commandPaletteOpen && (
        <CommandPalette
          items={NAVIGATION_ITEMS}
          searchQuery={state.searchQuery}
          onSearch={(query) => setState((prev) => ({ ...prev, searchQuery: query }))}
          onSelect={(id) => goToPage(id)}
          onClose={() => setState((prev) => ({ ...prev, commandPaletteOpen: false }))}
        />
      )}

      {/* Toast Notification */}
      <Toast visible={state.toastVisible} message={state.toastMessage} />
    </div>
  );
}

// ============================================================================
// SIDEBAR COMPONENT (Task 3)
// ============================================================================

interface DashboardSidebarProps {
  activeSection: string;
  blockHeight: number;
  onNavigate: (page: string) => void;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  wallet: MallchainWallet | null;
  networkStatus: string;
  onOpenCreateWallet?: () => void;
}

function DashboardSidebar({
  activeSection,
  blockHeight,
  onNavigate,
  userMenuOpen,
  onToggleUserMenu,
  wallet,
  networkStatus,
  onOpenCreateWallet,
}: DashboardSidebarProps) {
  const walletName = wallet?.name || 'No Wallet';
  const walletAddress = wallet?.address
    ? wallet.address.slice(0, 10) + '...' + wallet.address.slice(-6)
    : 'Not connected';

  return (
    <aside className="dashboard-sidebar">
      {/* Brand Section (3.2-3.3) */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">M</div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">MALLCHAIN</div>
          <div className="sidebar-brand-badge">
            {networkStatus === 'CONNECTED' ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-nav-scroll">
        {/* CORE Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">CORE</div>
          <nav className="sidebar-nav">
            {NAVIGATION_ITEMS.filter((item) => item.section === 'CORE').map((item) => (
              <button
                key={item.id}
                className={`sidebar-nav-item ${
                  activeSection === item.id ? 'active' : ''
                }`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ECOSYSTEM Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">ECOSYSTEM</div>
          <nav className="sidebar-nav">
            {NAVIGATION_ITEMS.filter((item) => item.section === 'ECOSYSTEM').map((item) => (
              <button
                key={item.id}
                className={`sidebar-nav-item ${
                  activeSection === item.id ? 'active' : ''
                }`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* DEVELOPER Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">DEVELOPER</div>
          <nav className="sidebar-nav">
            {NAVIGATION_ITEMS.filter((item) => item.section === 'DEVELOPER').map((item) => (
              <button
                key={item.id}
                className={`sidebar-nav-item ${
                  activeSection === item.id ? 'active' : ''
                }`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Status Card (3.10) */}
      <div className="sidebar-status-card">
        <div className="sidebar-status-label">Block Height</div>
        <div className="sidebar-status-value">{blockHeight.toLocaleString()}</div>
      </div>

      {/* Account Card (3.11-3.12) */}
      <div className="sidebar-status-card" style={{ marginTop: 'auto' }}>
        <div className="sidebar-status-label">Account</div>
        <button
          className="sidebar-nav-item"
          style={{ width: '100%', justifyContent: 'space-between' }}
          onClick={onToggleUserMenu}
        >
          <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{walletName}</span>
          <span>▼</span>
        </button>
        {wallet?.address && (
          <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '4px', wordBreak: 'break-all' }}>
            {walletAddress}
          </div>
        )}
        {userMenuOpen && (
          <div className="dropdown-menu">
            {onOpenCreateWallet && (
              <button
                className="dropdown-item"
                style={{ color: '#f3ba2f', fontWeight: 600 }}
                onClick={() => {
                  onToggleUserMenu();
                  onOpenCreateWallet();
                }}
              >
                {wallet ? '+ Add Account' : 'Create / Import Wallet'}
              </button>
            )}
            <button className="dropdown-item">Profile</button>
            <button className="dropdown-item">Settings</button>
            <button className="dropdown-item">Logout</button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ============================================================================
// HEADER COMPONENT (Task 4)
// ============================================================================

interface DashboardHeaderProps {
  onSearch: (query: string) => void;
  onOpenCommandPalette: () => void;
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  notificationOpen: boolean;
  lightMode: boolean;
  dropdownRef: React.RefObject<HTMLDivElement>;
  networkName: string;
  networkStatus: string;
  chainId: string;
}

function DashboardHeader({
  onSearch,
  onOpenCommandPalette,
  onToggleNotifications,
  onToggleTheme,
  notificationOpen,
  lightMode,
  dropdownRef,
  networkName,
  networkStatus,
  chainId,
}: DashboardHeaderProps) {
  const statusColor = networkStatus === 'CONNECTED' ? '#22c55e' : '#ef4444';
  const statusLabel = networkStatus === 'CONNECTED' ? 'Live' : 'Offline';

  return (
    <header className="dashboard-header" ref={dropdownRef}>
      {/* Greeting (4.2-4.3) */}
      <div className="header-greeting">
        <span className="header-greeting-emoji">👋</span>
        <div>
          <div className="header-greeting-text">Good afternoon</div>
          <div className="header-shortcut" style={{ fontSize: '12px', color: '#9ca3af' }}>
            {networkName} •{' '}
            <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
            {' '}• {chainId}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="header-actions">
        {/* Search Button (4.4) */}
        <button className="header-search-button" onClick={onOpenCommandPalette}>
          🔍
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>⌘K</span>
        </button>

        {/* Notifications (4.5-4.6) */}
        <div style={{ position: 'relative' }}>
          <button
            className="header-notification-bell"
            onClick={onToggleNotifications}
          >
            🔔
            <div className="header-notification-badge">7</div>
          </button>
          {notificationOpen && (
            <div className="dropdown-menu" style={{ right: 0, top: '45px' }}>
              <button className="dropdown-item">System upgrade v2.1.0</button>
              <button className="dropdown-item">Validator online</button>
            </div>
          )}
        </div>

        {/* Theme Toggle (4.7) */}
        <button
          className="header-notification-bell"
          onClick={onToggleTheme}
          title="Toggle theme"
        >
          {lightMode ? '🌙' : '☀️'}
        </button>

        {/* Avatar (4.8) */}
        <div className="header-profile-avatar">IM</div>
      </div>
    </header>
  );
}

// ============================================================================
// DASHBOARD PAGE COMPONENT (Task 7-10)
// ============================================================================

interface DashboardPageProps {
  blockHeight: number;
  tps: number;
  slips: SlipItem[];
  balances: Array<{ denom: string; amount: string; symbol?: string; formatted?: string }>;
  transactions: Array<{ hash: string; type: string; detail: string; when: string; amount: number; unit?: string }>;
  validators: Array<{ name: string; status: string; uptime: string }>;
  networkStatus: string;
  onNavigate: (page: string) => void;
  showToast: (msg: string) => void;
}

function DashboardPage({
  blockHeight,
  tps,
  slips,
  balances,
  transactions,
  validators,
  networkStatus,
  onNavigate,
  showToast,
}: DashboardPageProps) {
  // Derive live values from balances
  const nativeBalance = balances.find((b) => b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mall');
  const mlptsBalance = balances.find((b) => b.denom === 'umlpts' || b.denom === 'MLPTS');
  const formattedMlcns = nativeBalance?.formatted || (nativeBalance ? (parseFloat(nativeBalance.amount) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00');
  const formattedMlpts = mlptsBalance?.formatted || (mlptsBalance ? (parseFloat(mlptsBalance.amount) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0');
  const txCount = transactions.length;
  const validatorCount = validators.length;
  // Banner with live digit strips (Task 7)
  const bannerContent = (
    <div className="banner">
      <div className="banner-status-dot"></div>
      <div className="banner-text">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}
        >
          <div className="banner-message">Building is open — all systems healthy</div>
        </div>
        <div className="banner-stats">
          <div className="banner-stat">
            <div className="digit-strip">
              {digitStrip(blockHeight, 8)
                .split('')
                .map((digit, i) => (
                  <div key={i} className="digit">
                    {digit}
                  </div>
                ))}
            </div>
            <span className="banner-stat-label">block height</span>
          </div>
          <div className="banner-stat">
            <div className="digit-strip">
              {digitStrip(tps, 4)
                .split('')
                .map((digit, i) => (
                  <div key={i} className="digit">
                    {digit}
                  </div>
                ))}
            </div>
            <span className="banner-stat-label">tps</span>
          </div>
          <span style={{ color: '#f59e0b', fontSize: '20px' }}>›</span>
        </div>
      </div>
    </div>
  );

  // Stat cards (Task 8) — live data from blockchain
  const statCards = (
    <div className="grid-4col">
      {[
        { label: 'Wallet Balance', value: `${formattedMlcns} MLCNS`, tag: 'green', icon: '💼', sub: mlptsBalance ? `${formattedMlpts} MLPTS` : 'No MLPTS' },
        { label: 'Transactions', value: `${txCount} found`, tag: 'amber', icon: '📊', sub: networkStatus === 'CONNECTED' ? 'On-chain' : 'No connection' },
        { label: 'Validators', value: `${validatorCount} active`, tag: 'purple', icon: '✓', sub: networkStatus === 'CONNECTED' ? 'Live set' : 'Unavailable' },
        { label: 'Block Height', value: `#${blockHeight.toLocaleString()}`, tag: 'blue', icon: '📦', sub: networkStatus === 'CONNECTED' ? 'Synced' : 'Waiting...' },
      ].map((card, i) => (
        <div key={i} className="card stat-card">
          <div className="stat-card-header">
            <div className="stat-card-label">
              <div className={`stat-card-icon ${card.tag}`}>{card.icon}</div>
              <span className="stat-card-label-text">{card.label}</span>
            </div>
            <div className={`stat-card-tag ${card.tag}`}>●</div>
          </div>
          <div className="stat-card-value">{card.value}</div>
          <div
            className="stat-card-subtitle"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{card.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );

  // Recent activity and quick actions (Task 9-10)
  return (
    <div>
      {bannerContent}
      <div style={{ marginTop: '24px' }}>{statCards}</div>

      {/* Mid-row grid - Slips and Accounts (Task 9) */}
      <div
        className="grid-mixed"
        style={{ marginTop: '24px' }}
      >
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Recent Slips</h3>
            <span
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                background: 'rgba(34, 197, 94, 0.1)',
                color: '#22c55e',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              LIVE
            </span>
          </div>
          {slips.slice(0, 5).map((slip) => (
            <div key={slip.id} className="activity-item">
              <div
                className={`activity-icon ${slip.amountClass.replace('amt-', '')}`}
              >
                {slip.type[0]}
              </div>
              <div className="activity-content">
                <div className="activity-title">{slip.type}</div>
                <div className="activity-subtitle">{slip.detail}</div>
                <div className="activity-time">{slip.when}</div>
              </div>
              <div className={`activity-amount ${slip.amountClass.replace('amt-', '')}`}>
                {slip.amount > 0 ? '+' : ''}
                {slip.amount !== 0 && Math.abs(slip.amount) < 0.01
                  ? slip.amount.toPrecision(2)
                  : slip.amount.toFixed(2)}
                {slip.unit || ' MLCNS'}
              </div>
            </div>
          ))}
          <button
            className="button button-secondary"
            onClick={() => onNavigate('wallet')}
            style={{ width: '100%', marginTop: '12px' }}
          >
            View all →
          </button>
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Network Info</h3>
            <span
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                background: 'rgba(6, 182, 212, 0.1)',
                color: '#06b6d4',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              LIVE
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #2a2d3a' }}>
              <span>Chain ID</span>
              <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{mallchainClient.getNetwork().chainId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #2a2d3a' }}>
              <span>Block Time</span>
              <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{(mallchainClient.getNetwork().blockTimeMs / 1000).toFixed(1)}s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #2a2d3a' }}>
              <span>RPC Endpoint</span>
              <span style={{ color: '#e5e7eb', fontFamily: 'monospace', fontSize: '10px' }}>{mallchainClient.getNetwork().rpcUrl}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Bech32 Prefix</span>
              <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{mallchainClient.getNetwork().bech32Prefix}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions (Task 10) */}
      <div style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
          }}
        >
          {[
            { label: 'Send', id: 'send', icon: '📤', primary: true },
            { label: 'Receive', id: 'receive', icon: '📥', primary: false },
            { label: 'Buy', id: 'buy', icon: '💳', primary: false },
            { label: 'Voting', id: 'governance', icon: '🗳️', primary: false },
          ].map((action) => (
            <button
              key={action.id}
              className={`button ${action.primary ? 'button-primary' : 'button-secondary'}`}
              onClick={() => onNavigate(action.id)}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <span style={{ fontSize: '20px' }}>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

// ============================================================================
// RIGHT RAIL COMPONENT (Task 11)
// ============================================================================

interface RightRailProps {
  activityFeed: ActivityFeedItem[];
  onNavigate: (page: string) => void;
  showToast: (msg: string) => void;
}

function RightRail({
  activityFeed,
  onNavigate,
  showToast,
}: RightRailProps) {
  return (
    <aside className="dashboard-right-rail">
      {/* Quick Actions Mini (11.3-11.6) */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
          Quick Actions
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
          }}
        >
          {[
            { label: 'Send', id: 'send', icon: '📤' },
            { label: 'Receive', id: 'receive', icon: '📥' },
            { label: 'Buy', id: 'buy', icon: '💳' },
            { label: 'Vote', id: 'governance', icon: '🗳️' },
            { label: 'Scan QR', id: 'scan', icon: '📱' },
          ].map((action) => (
            <button
              key={action.id}
              className="button button-secondary"
              onClick={() => {
                if (action.id === 'scan') {
                  showToast('QR scanner feature coming soon');
                } else {
                  onNavigate(action.id);
                }
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '12px 8px',
                fontSize: '12px',
              }}
            >
              <span style={{ fontSize: '16px' }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Feed (11.11-11.13) */}
      <div className="card" style={{ marginTop: '12px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
          Activity
        </h3>
        {activityFeed.slice(0, 5).map((item) => (
          <div key={item.id} className="activity-item">
            <div className={`activity-icon ${item.color}`}>{item.icon}</div>
            <div className="activity-content">
              <div className="activity-title">{item.title}</div>
              <div className="activity-subtitle" style={{ fontSize: '12px' }}>
                {item.subtitle}
              </div>
              <div className="activity-time">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ============================================================================
// OTHER PAGE COMPONENTS (Tasks 12-22) - STUBS
// ============================================================================

function WalletPage({
  slips,
  balances,
  wallet,
  transactions,
  onOpenCreateWallet,
}: {
  slips: SlipItem[];
  balances: Array<{ denom: string; amount: string; symbol?: string; formatted?: string }>;
  wallet: MallchainWallet | null;
  transactions: Array<{ hash: string; type: string; detail: string; when: string; amount: number; unit?: string }>;
  onOpenCreateWallet?: () => void;
}) {
  const nativeBalance = balances.find((b) => b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mall');
  const mlptsBalance = balances.find((b) => b.denom === 'umlpts' || b.denom === 'MLPTS');
  const formattedMlcns = nativeBalance?.formatted || (nativeBalance ? (parseFloat(nativeBalance.amount) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00');
  const formattedMlpts = mlptsBalance?.formatted || (mlptsBalance ? (parseFloat(mlptsBalance.amount) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0');

  if (!wallet) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No wallet connected</div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
          Create a new wallet or import one with your recovery phrase to get started.
        </div>
        {onOpenCreateWallet && (
          <button className="button button-primary" onClick={onOpenCreateWallet}>
            Create / Import Wallet
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
          {formattedMlcns} MLCNS
        </h2>
        <div style={{ fontSize: '14px', color: '#9ca3af' }}>
          {formattedMlpts} MLPTS
        </div>
        {wallet?.address && (
          <div style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', marginTop: '8px', wordBreak: 'break-all' }}>
            {wallet.address}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
          Activity
        </h3>
        {transactions.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            No transactions found for this address
          </div>
        ) : (
          <table className="table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell">Type</th>
                <th className="table-header-cell">Detail</th>
                <th className="table-header-cell">When</th>
                <th className="table-header-cell right-align">Hash</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 20).map((tx) => (
                <tr key={tx.hash} className="table-body-row">
                  <td className="table-body-cell">{tx.type}</td>
                  <td className="table-body-cell">{tx.detail}</td>
                  <td className="table-body-cell">{tx.when}</td>
                  <td className="table-body-cell right-align" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    {tx.hash.slice(0, 10)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SendPage({
  wallet,
  showToast,
  onNavigate,
}: {
  wallet: MallchainWallet | null;
  showToast: (msg: string) => void;
  onNavigate?: (page: string) => void;
}) {
  // Same 4-step wizard as v14's WalletSend: recipient → review → sign → sent
  type SendStep = 'recipient' | 'review' | 'sign' | 'sent';
  const [step, setStep] = useState<SendStep>('recipient');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [gasError, setGasError] = useState(false);
  const [gettingGas, setGettingGas] = useState(false);
  const [mlcnsAvailable, setMlcnsAvailable] = useState<number | null>(null);

  // Real MLCNS balance from the chain's mlcoin module via the backend —
  // the same source v14's wallet balance comes from (bank `stake` is only gas).
  useEffect(() => {
    if (!wallet?.address) {
      setMlcnsAvailable(null);
      return;
    }
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/send/mlcns/balance/${wallet.address}`);
        const data = await res.json();
        if (isMounted && res.ok && data.success) {
          const available =
            typeof data.availableDisplay === 'number'
              ? data.availableDisplay
              : parseFloat(data.available || '0') / 1_000_000;
          setMlcnsAvailable(available);
        }
      } catch {
        // Balance endpoint unavailable — keep last known value (real data, no fallback numbers)
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [wallet?.address]);

  // Real on-chain fee actually paid when signing: gas limit × gas price from the
  // shared mallcoinTx config (250,000 gas × 0.01 stake/gas = 0.0025 STAKE).
  const networkFee = getNetworkFeeEstimate();

  const isValidAddress = (addr: string) => addr.startsWith('mall1') && addr.length >= 39 && addr.length <= 64;

  const resetForm = () => {
    setStep('recipient');
    setRecipient('');
    setAmount('');
    setMemo('');
    setPassword('');
    setTxHash(null);
    setSendError(null);
    setGasError(false);
  };

  // ── Step 1: Recipient ──
  if (!wallet) {
    return (
      <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>Send MLCNS</h2>
        <div style={{ padding: '32px 16px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No wallet connected</div>
          <div style={{ fontSize: 13 }}>Connect a wallet to send MLCNS.</div>
        </div>
      </div>
    );
  }

  const steps: { key: SendStep; label: string }[] = [
    { key: 'recipient', label: 'Recipient' },
    { key: 'review', label: 'Review' },
    { key: 'sign', label: 'Sign' },
    { key: 'sent', label: 'Sent' },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);

  // Same review validation as v14's WalletSend.review()
  const review = () => {
    setSendError(null);
    const amt = parseFloat(amount);
    if (!isValidAddress(recipient)) { setSendError('Invalid address — expected a mall1… bech32 address.'); return; }
    if (!amt || amt <= 0) { setSendError('Enter a valid amount.'); return; }
    if (mlcnsAvailable !== null && amt > mlcnsAvailable) {
      setSendError(`Insufficient balance — you have ${mlcnsAvailable.toFixed(2)} MLCNS.`);
      return;
    }
    setStep('review');
  };

  // Same gas recovery as v14's WalletSend.getGas() — backend faucet fund-gas
  const getGas = async () => {
    if (!wallet.address) return;
    setGettingGas(true);
    try {
      const res = await fetch('/api/faucet/fund-gas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Network fee tokens received — you can retry now');
        setGasError(false);
      } else {
        showToast(data?.error?.message || 'Could not get network fee tokens right now');
      }
    } catch {
      showToast('Could not get network fee tokens right now');
    } finally {
      setGettingGas(false);
    }
  };

  // Same authorize operation as v14's WalletSend.authorize(): password-gated
  // mnemonic access, fully offline Direct signing of MsgTransferMallcoin,
  // broadcast via the backend's POST /api/send/mallcoins.
  const sign = async () => {
    if (!wallet || !password) return;
    setBusy(true);
    setSendError(null);
    try {
      const mnemonic = await wallet.exportMnemonic(password);
      const result = await sendMallcoinTransfer({
        mnemonic,
        fromAddress: wallet.address,
        toAddress: recipient,
        amountMlcns: parseFloat(amount),
        memo: memo || undefined,
      });
      setTxHash(result.txHash);
      setStep('sent');
      showToast('Transaction broadcast — pending confirmation');
    } catch (e) {
      if (e instanceof MallcoinTxError && e.code === 'NO_ON_CHAIN_HISTORY') {
        setGasError(true);
      } else {
        setSendError(e instanceof Error ? e.message : 'Failed to send');
      }
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '460px' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 600 }}>Send MLCNS</h2>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: i < stepIdx ? '#22c55e' : i === stepIdx ? '#f3ba2f' : '#6b7280',
              fontSize: 12, fontWeight: i === stepIdx ? 600 : 400,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: i < stepIdx ? 'rgba(34,197,94,0.15)' : i === stepIdx ? 'rgba(243,186,47,0.15)' : 'rgba(107,114,128,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
              }}>
                {i < stepIdx ? '✓' : i + 1}
              </div>
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 1, alignSelf: 'center',
                background: i < stepIdx ? '#22c55e' : '#374151',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Available balance (real mlcoin module balance) */}
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
        Available: {mlcnsAvailable === null ? '…' : mlcnsAvailable.toFixed(2)} MLCNS
      </div>

      {/* Step 1: Recipient */}
      {step === 'recipient' && (
        <div>
          <div className="form-group">
            <label className="form-label">Recipient Address</label>
            <input
              type="text"
              className="form-input"
              placeholder="mall1..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            {recipient && !isValidAddress(recipient) && (
              <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Invalid mallchain address</div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Amount (MLCNS)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                className="form-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ paddingRight: 60 }}
              />
              <button
                type="button"
                onClick={() => setAmount(Math.max(0, mlcnsAvailable ?? 0).toFixed(6))}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(243,186,47,0.15)', color: '#f3ba2f', border: 'none',
                  borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}
              >
                MAX
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Memo (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Optional memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          {sendError && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{sendError}</div>
          )}
          <button
            className="button button-primary button-large"
            style={{ width: '100%', marginTop: 8 }}
            disabled={!recipient || !amount || parseFloat(amount) <= 0}
            onClick={review}
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && (
        <div>
          <div style={{ background: '#1a1d29', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>To</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{recipient}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Amount</span>
              <span style={{ color: '#f3ba2f', fontWeight: 600 }}>{amount} MLCNS</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Network Fee</span>
              <span>{networkFee.display} STAKE (gas)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Gas Limit</span>
              <span>{networkFee.gasLimit.toLocaleString()}</span>
            </div>
            {memo && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>Memo</span>
                <span>{memo}</span>
              </div>
            )}
          </div>
          {sendError && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{sendError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" style={{ flex: 1 }} onClick={() => setStep('recipient')}>Back</button>
            <button className="button button-primary" style={{ flex: 1 }} onClick={() => setStep('sign')}>Authorize</button>
          </div>
        </div>
      )}

      {/* Step 3: Sign */}
      {step === 'sign' && (
        <div>
          {gasError ? (
            /* Same gas-error card as v14's NO_ON_CHAIN_HISTORY handling */
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>⚠️ Gas balance needed</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
                This account has no on-chain history yet — it needs a small stake balance for gas before it can send.
              </div>
              <button className="button button-primary" style={{ width: '100%' }} disabled={gettingGas} onClick={getGas}>
                {gettingGas ? 'Requesting…' : 'Get Network Fee Tokens'}
              </button>
            </div>
          ) : (
            <div style={{ background: '#1a1d29', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
                Enter your wallet password to sign this transaction.
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Wallet password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}
          {sendError && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{sendError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" style={{ flex: 1 }} onClick={() => { setStep('review'); setSendError(null); setGasError(false); }}>Back</button>
            {!gasError && (
              <button
                className="button button-primary"
                style={{ flex: 1 }}
                disabled={!password || busy}
                onClick={sign}
              >
                {busy ? 'Signing...' : 'Sign & Broadcast'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Sent — same as v14's broadcast step ("pending confirmation on-chain") */}
      {step === 'sent' && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(34,197,94,0.1)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <span style={{ fontSize: 24 }}>✓</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>
            Transaction Broadcast
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
            Your transfer is pending confirmation on-chain
          </div>
          {txHash && (
            <div style={{
              background: '#1a1d29', borderRadius: 8, padding: 12,
              fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 16,
            }}>
              {txHash}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" style={{ flex: 1 }} onClick={() => onNavigate?.('explorer')}>Explorer</button>
            <button className="button button-primary" style={{ flex: 1 }} onClick={resetForm}>Back to Wallet</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReceivePage({ showToast, wallet, balances }: { showToast: (msg: string) => void; wallet: MallchainWallet | null; balances: Array<{ denom: string; amount: string }> }) {
  const address = wallet?.address || '';
  const network = mallchainClient.getNetwork();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [startBalance, setStartBalance] = useState<number | null>(null);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate QR code on mount
  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, { width: 180, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [address]);

  // Await payment polling
  useEffect(() => {
    if (!awaitingPayment || !wallet?.address) return;

    pollRef.current = setInterval(async () => {
      try {
        const bals = await mallchainClient.getBalances(wallet!.address);
        const nativeBal = bals.find((b) => b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mall');
        const currentBalance = nativeBal ? parseFloat(nativeBal.amount) / 1_000_000 : 0;
        if (startBalance !== null && currentBalance > startBalance) {
          setPaymentReceived(true);
          setAwaitingPayment(false);
          showToast('Payment received!');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [awaitingPayment, wallet?.address, startBalance, showToast]);

  const nativeBalance = balances.find((b) => b.denom === 'umall' || b.denom === 'MLCNS' || b.denom === 'mall');
  const currentBalance = nativeBalance ? (parseFloat(nativeBalance.amount) / 1_000_000) : 0;

  const startAwaitingPayment = () => {
    setStartBalance(currentBalance);
    setAwaitingPayment(true);
    setPaymentReceived(false);
  };

  const copyAddress = async () => {
    if (!address) { showToast('No wallet selected'); return; }
    try {
      await navigator.clipboard.writeText(address);
      showToast('Address copied to clipboard');
    } catch {
      showToast('Failed to copy address');
    }
  };

  const shareAddress = async () => {
    if (!address) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mallchain Address', text: address });
      } catch {
        // User cancelled
      }
    } else {
      copyAddress();
    }
  };

  if (!wallet) {
    return (
      <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>Receive MLCNS</h2>
        <div style={{ padding: '32px 16px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No wallet connected</div>
          <div style={{ fontSize: 13 }}>Connect a wallet to receive MLCNS.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Receive MLCNS
      </h2>

      {/* QR Code */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
        <div style={{
          width: 200, height: 200, background: '#fff', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 10, margin: '0 auto',
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Address QR" style={{ width: 180, height: 180, borderRadius: 4 }} />
          ) : (
            <div style={{ color: '#000', fontSize: 12 }}>Generating QR...</div>
          )}
        </div>
        {/* Payment received overlay */}
        {paymentReceived && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, color: '#fff',
            }}>✓</div>
          </div>
        )}
        {/* Awaiting payment pulse */}
        {awaitingPayment && !paymentReceived && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: 16,
            border: '2px solid rgba(243,186,47,0.4)', animation: 'pulse 2s infinite',
          }} />
        )}
      </div>

      {/* Address display */}
      <div style={{
        background: '#1a1d29', padding: 12, borderRadius: 8,
        fontSize: 12, fontFamily: 'monospace', marginBottom: 12, wordBreak: 'break-all',
      }}>
        {address}
      </div>

      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
        Network: {network.name} ({network.chainId})
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="button button-primary" style={{ flex: 1 }} onClick={copyAddress}>
          Copy Address
        </button>
        <button className="button" style={{ flex: 1 }} onClick={shareAddress}>
          Share
        </button>
      </div>

      {/* Await payment */}
      {!awaitingPayment && !paymentReceived && (
        <button
          className="button"
          style={{ width: '100%', marginTop: 8, borderColor: '#f3ba2f', color: '#f3ba2f' }}
          onClick={startAwaitingPayment}
        >
          Await Payment
        </button>
      )}
      {awaitingPayment && !paymentReceived && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#f3ba2f' }}>
          <div style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f3ba2f', marginRight: 8, animation: 'pulse 1.5s infinite' }} />
          Watching for balance increase above {startBalance?.toFixed(2)} MLCNS...
        </div>
      )}
      {paymentReceived && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
          Payment received! Balance: {currentBalance.toFixed(2)} MLCNS
        </div>
      )}
    </div>
  );
}

function BuyPage({
  wallet,
  showToast,
}: {
  wallet: MallchainWallet | null;
  showToast: (msg: string) => void;
}) {
  type BuyStep = 'form' | 'awaiting_payment' | 'crediting' | 'done';
  const [config, setConfig] = useState<BuyConfig | null>(null);
  const [amount, setAmount] = useState('100');
  const [fiat, setFiat] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<BuyStep>('form');
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const FALLBACK_KES_PER_MLCNS = 0.62;
  const buyRateKes = config?.rates?.buyPriceKes || FALLBACK_KES_PER_MLCNS;
  const directBuyLocked = config?.directBuy?.locked ?? false;

  // Load config on mount
  useEffect(() => {
    buyApi.getConfig().then((r) => {
      if (r.ok && r.data) {
        setConfig(r.data);
        const n = parseFloat(amount);
        if (Number.isFinite(n)) {
          setFiat(String(Math.round(n * (r.data.rates?.buyPriceKes || FALLBACK_KES_PER_MLCNS))));
        }
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAmountChange = (v: string) => {
    setAmount(v);
    const n = parseFloat(v);
    if (Number.isFinite(n)) setFiat(String(Math.round(n * buyRateKes)));
  };

  const pollStatus = (paymentId: string, onConfirmed: () => void, onCredited: () => void) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await buyApi.getStatus(paymentId);
      if (!res.ok || !res.data) return;
      setQuote(res.data);
      // Status can be 'confirmed' (callback just received) or 'processing' (credit already started)
      // Both should trigger the credit call if we haven't already
      if (res.data.status === 'confirmed' || res.data.status === 'processing') {
        onConfirmed();
      } else if (res.data.status === 'credited') {
        onCredited();
      } else if (res.data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        showToast(res.data.reason || 'Payment failed');
        setStep('form');
        setBusy(false);
      }
    }, 3000);
  };

  const submit = async () => {
    if (!wallet?.address) {
      showToast('Connect a wallet first');
      return;
    }
    const mlcns = parseFloat(amount);
    if (!mlcns || mlcns <= 0) {
      showToast('Enter a valid MLCNS amount');
      return;
    }
    if (!/^254\d{9}$/.test(phone)) {
      showToast('Enter phone as 254XXXXXXXXX');
      return;
    }

    setBusy(true);

    const reserveRes = await buyApi.reserve({
      amount: mlcns,
      fiat,
      currency: 'KES',
      walletAddress: wallet.address,
      phone,
    });

    if (!reserveRes.ok || !reserveRes.data) {
      showToast(reserveRes.error || 'Failed to reserve quote');
      setBusy(false);
      return;
    }

    setQuote(reserveRes.data.quote);

    if (!config?.configured.stkPush) {
      showToast('Quote reserved, but M-Pesa STK push is not configured.');
      setBusy(false);
      return;
    }

    const quoteId = reserveRes.data.quoteId;
    const mpesaRes = await buyApi.initiateMpesa({ quoteId, phone, amount: mlcns, description: `Buy ${mlcns} MLCNS` });

    if (!mpesaRes.ok || !mpesaRes.data) {
      showToast(mpesaRes.error || 'Failed to start M-Pesa payment');
      setBusy(false);
      return;
    }

    setStep('awaiting_payment');
    showToast('Check your phone for the M-Pesa prompt');

    pollStatus(
      mpesaRes.data.paymentId,
      async () => {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('crediting');
        const creditRes = await buyApi.credit({ quoteId });
        if (!creditRes.ok) {
          showToast(creditRes.error || 'On-chain credit failed');
          setStep('form');
          setBusy(false);
          return;
        }
        pollStatus(
          mpesaRes.data!.paymentId,
          () => {},
          () => {
            if (pollRef.current) clearInterval(pollRef.current);
            setStep('done');
            setBusy(false);
            showToast('Mallcoin credited to your wallet!');
          }
        );
      },
      () => {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('done');
        setBusy(false);
      }
    );
  };

  // No wallet
  if (!wallet) {
    return (
      <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>Buy MALL</h2>
        <div style={{ padding: '32px 16px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No wallet connected</div>
          <div style={{ fontSize: 13 }}>Connect a wallet to buy Mallcoin with M-Pesa.</div>
        </div>
      </div>
    );
  }

  // Direct buy locked
  if (directBuyLocked) {
    return (
      <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>Buy MALL</h2>
        <div style={{ padding: '24px 16px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>Direct purchases are closed</div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            The MLCN/KES liquidity pool has reached its threshold. You can still get MLCNS by converting Mallpoints or receiving a transfer.
          </div>
        </div>
      </div>
    );
  }

  // Step indicator
  const stepMeta: { label: string; icon: string }[] = [
    { label: 'Details', icon: '💳' },
    { label: 'Pay', icon: '📱' },
    { label: 'Credit', icon: '⏳' },
    { label: 'Done', icon: '✓' },
  ];
  const stepIndex: Record<BuyStep, number> = { form: 0, awaiting_payment: 1, crediting: 2, done: 3 };
  const curStep = stepIndex[step];

  return (
    <div className="card" style={{ maxWidth: '460px' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 600 }}>Buy MALL</h2>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
        Pay with M-Pesa — Mallcoin credited to your wallet on-chain
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {stepMeta.map((s, i) => (
          <React.Fragment key={s.label}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: i < curStep ? '#22c55e' : i === curStep ? '#f3ba2f' : '#6b7280',
              fontSize: 12, fontWeight: i === curStep ? 600 : 400,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: i < curStep ? 'rgba(34,197,94,0.15)' : i === curStep ? 'rgba(243,186,47,0.15)' : 'rgba(107,114,128,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
              }}>
                {i < curStep ? '✓' : s.icon}
              </div>
              {s.label}
            </div>
            {i < stepMeta.length - 1 && (
              <div style={{
                flex: 1, height: 1, alignSelf: 'center',
                background: i < curStep ? '#22c55e' : '#374151',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* STK warning */}
      {config && !config.configured.stkPush && (
        <div style={{
          background: 'rgba(243,186,47,0.08)', border: '1px solid rgba(243,186,47,0.2)',
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#f3ba2f',
        }}>
          M-Pesa STK push isn't configured in this environment. You can reserve a quote, but payment can't be completed here.
        </div>
      )}

      {/* Step: Form */}
      {step === 'form' && (
        <div>
          <div className="form-group">
            <label className="form-label">Amount (MLCNS)</label>
            <input
              type="number"
              className="form-input"
              min="1"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="form-group">
            <label className="form-label">You pay (KES)</label>
            <input
              type="number"
              className="form-input"
              min="1"
              value={fiat}
              onChange={(e) => setFiat(e.target.value)}
              disabled={busy}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              Rate ≈ {buyRateKes.toFixed(2)} KES / MLCNS
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">M-Pesa phone number</label>
            <input
              type="tel"
              className="form-input"
              placeholder="254712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </div>

          {/* Preview */}
          <div style={{ background: '#1a1d29', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>You receive</span>
              <span style={{ color: '#f3ba2f', fontWeight: 600 }}>{amount || '0'} MLCNS</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>You pay</span>
              <span>{fiat || '0'} KES</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Phone</span>
              <span style={{ fontFamily: 'monospace' }}>{phone || '—'}</span>
            </div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Rate</span>
              <span>{buyRateKes.toFixed(2)} KES / MLCNS</span>
            </div>
          </div>

          <button
            className="button button-primary button-large"
            style={{ width: '100%' }}
            disabled={busy}
            onClick={submit}
          >
            {busy ? 'Processing...' : 'Buy Mallcoin'}
          </button>
        </div>
      )}

      {/* Step: Awaiting payment */}
      {step === 'awaiting_payment' && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 24 }}>📱</span>
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Check your phone</div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
            Complete the M-Pesa prompt sent to <b style={{ fontFamily: 'monospace' }}>{phone}</b> for <b>{fiat} KES</b>.
          </div>
          {quote && (
            <div style={{ marginTop: 12, fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>
              Quote {quote.quoteId}
            </div>
          )}
        </div>
      )}

      {/* Step: Crediting */}
      {step === 'crediting' && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(34,197,94,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>⏳</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>Payment confirmed</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Crediting Mallcoin to your wallet on-chain...</div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && quote && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: quote.status === 'credited' ? 'rgba(34,197,94,0.1)' : 'rgba(243,186,47,0.1)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <span style={{ fontSize: 24 }}>{quote.status === 'credited' ? '✓' : '⏳'}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: quote.status === 'credited' ? '#22c55e' : undefined, marginBottom: 8 }}>
            {quote.status === 'credited' ? 'Mallcoin credited' : `Status: ${quote.status}`}
          </div>
          {quote.txHash && (
            <div style={{
              background: '#1a1d29', borderRadius: 8, padding: 12, marginTop: 8,
              fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
            }}>
              {quote.txHash}
            </div>
          )}
          {quote.reason && quote.status !== 'credited' && (
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>{quote.reason}</div>
          )}
          <button
            className="button button-primary"
            style={{ marginTop: 20 }}
            onClick={() => { setStep('form'); setQuote(null); setPhone(''); }}
          >
            New purchase
          </button>
        </div>
      )}
    </div>
  );
}

function MarketplacePage() {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Marketplace
      </h2>
      <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        Marketplace listings will be populated from the backend when available.
      </div>
    </div>
  );
}

function GovernancePage({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Governance
      </h2>
      <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        Governance proposals will be fetched from the blockchain governance module.
      </div>
    </div>
  );
}

function ValidatorsPage({ validators }: { validators: Array<{ name: string; status: string; uptime: string }> }) {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Validators
      </h2>
      {validators.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          No validators found — node may be offline or still syncing
        </div>
      ) : (
        <table className="table">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Validator</th>
              <th className="table-header-cell">Status</th>
              <th className="table-header-cell right-align">Uptime</th>
            </tr>
          </thead>
          <tbody>
            {validators.map((row, i) => (
              <tr key={i} className="table-body-row">
                <td className="table-body-cell">{row.name}</td>
                <td className="table-body-cell">
                  <span className={`status-pill ${row.status === 'Active' ? 'green' : 'red'}`}>{row.status}</span>
                </td>
                <td className="table-body-cell right-align">{row.uptime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExplorerPage({ blockHeight, networkName }: { blockHeight: number; networkName: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{ type: string; data: any } | null>(null);
  const [searching, setSearching] = useState(false);
  const [recentBlocks, setRecentBlocks] = useState<Array<{ height: number; hash: string; txCount: number; timestamp: string }>>([]);

  useEffect(() => {
    let isMounted = true;
    const loadBlocks = async () => {
      try {
        const blocks = await mallchainClient.getBlocks();
        if (isMounted) {
          setRecentBlocks(blocks.slice(0, 10).map((b) => ({
            height: b.height,
            hash: b.hash,
            txCount: b.txCount,
            timestamp: b.timestamp,
          })));
        }
      } catch {
        // Node offline
      }
    };
    loadBlocks();
    const interval = setInterval(loadBlocks, 6000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      // Try as block height first
      const height = parseInt(searchQuery.trim(), 10);
      if (!isNaN(height)) {
        const block = await mallchainClient.getBlockByHeight(height);
        if (block) {
          setSearchResult({ type: 'block', data: block });
          setSearching(false);
          return;
        }
      }
      // Try as transaction hash
      const tx = await mallchainClient.getTransactionByHash(searchQuery.trim());
      if (tx) {
        setSearchResult({ type: 'transaction', data: tx });
      } else {
        setSearchResult({ type: 'error', data: 'No block or transaction found' });
      }
    } catch {
      setSearchResult({ type: 'error', data: 'Search failed — node may be offline' });
    }
    setSearching(false);
  };

  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Block Explorer
      </h2>
      <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '16px' }}>
        Block height {blockHeight.toLocaleString()} · {networkName}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by block height or transaction hash..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1 }}
        />
        <button
          className="button button-primary"
          onClick={handleSearch}
          disabled={searching}
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Search Result */}
      {searchResult && (
        <div className="card" style={{ marginBottom: '24px', background: 'rgba(255,255,255,0.03)' }}>
          {searchResult.type === 'block' && (
            <div>
              <div style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: 600, marginBottom: '8px' }}>BLOCK</div>
              <div style={{ fontSize: '14px' }}>Height: {searchResult.data.height}</div>
              <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '4px', wordBreak: 'break-all' }}>
                Hash: {searchResult.data.hash}
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Transactions: {searchResult.data.txCount}</div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{searchResult.data.timestamp}</div>
            </div>
          )}
          {searchResult.type === 'transaction' && (
            <div>
              <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600, marginBottom: '8px' }}>TRANSACTION</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>Hash: {searchResult.data.hash}</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Type: {searchResult.data.type}</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Status: {searchResult.data.status}</div>
            </div>
          )}
          {searchResult.type === 'error' && (
            <div style={{ color: '#ef4444', fontSize: '14px' }}>{searchResult.data}</div>
          )}
        </div>
      )}

      {/* Recent Blocks */}
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Recent Blocks</h3>
      {recentBlocks.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          No blocks available — node may be offline
        </div>
      ) : (
        <table className="table">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Height</th>
              <th className="table-header-cell">Hash</th>
              <th className="table-header-cell">Txs</th>
              <th className="table-header-cell right-align">Time</th>
            </tr>
          </thead>
          <tbody>
            {recentBlocks.map((block) => (
              <tr key={block.height} className="table-body-row">
                <td className="table-body-cell" style={{ fontWeight: 600 }}>{block.height.toLocaleString()}</td>
                <td className="table-body-cell" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {block.hash ? block.hash.slice(0, 14) + '...' : '—'}
                </td>
                <td className="table-body-cell">{block.txCount}</td>
                <td className="table-body-cell right-align" style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {new Date(block.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ContractsPage() {
  const [contractAddress, setContractAddress] = useState('');
  const [queryMsg, setQueryMsg] = useState('{"get_count":{}}');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuery = async () => {
    if (!contractAddress.trim()) {
      setError('Enter a contract address');
      return;
    }
    setQuerying(true);
    setError(null);
    setQueryResult(null);
    try {
      const msg = JSON.parse(queryMsg);
      const result = await mallchainClient.queryContractSmart(contractAddress.trim(), msg);
      setQueryResult(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setError(err.message || 'Contract query failed');
    }
    setQuerying(false);
  };

  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Smart Contracts
      </h2>
      <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '16px' }}>
        Query CosmWasm smart contracts deployed on {mallchainClient.getNetwork().name}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px', display: 'block' }}>Contract Address</label>
        <input
          type="text"
          className="form-input"
          placeholder="mall1..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px', display: 'block' }}>Query Message (JSON)</label>
        <textarea
          className="form-input"
          rows={3}
          style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
          value={queryMsg}
          onChange={(e) => setQueryMsg(e.target.value)}
        />
      </div>

      <button
        className="button button-primary"
        onClick={handleQuery}
        disabled={querying}
      >
        {querying ? 'Querying...' : 'Smart Query'}
      </button>

      {error && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {queryResult && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600, marginBottom: '8px' }}>QUERY RESULT</div>
          <pre style={{ fontSize: '13px', fontFamily: 'monospace', color: '#e5e7eb', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
            {queryResult}
          </pre>
        </div>
      )}

      {!queryResult && !error && (
        <div style={{ marginTop: '24px', padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          Enter a CosmWasm contract address and query message to execute a read-only smart query
        </div>
      )}
    </div>
  );
}

function DevHubPage() {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        Developer Hub
      </div>
      <div style={{ color: '#9ca3af' }}>
        Documentation and API reference coming soon
      </div>
    </div>
  );
}

// ============================================================================
// COMMAND PALETTE COMPONENT (Task 5)
// ============================================================================

interface CommandPaletteProps {
  items: typeof NAVIGATION_ITEMS;
  searchQuery: string;
  onSearch: (query: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function CommandPalette({
  items,
  searchQuery,
  onSearch,
  onSelect,
  onClose,
}: CommandPaletteProps) {
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="command-palette" onClick={onClose}>
      <div className="command-palette-box" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          className="command-palette-input"
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          autoFocus
        />
        <div className="command-palette-list">
          {filtered.map((item) => (
            <button
              key={item.id}
              className="command-palette-item"
              onClick={() => onSelect(item.id)}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOAST NOTIFICATION COMPONENT (Task 6)
// ============================================================================

function Toast({ visible, message }: { visible: boolean; message: string }) {
  return (
    <div className={`toast ${visible ? 'show' : ''}`}>
      {message}
    </div>
  );
}
