/**
 * MallchainDashboard Component - Root Container
 * Task 2: Dark Glassmorphism Dashboard Implementation
 * 
 * Main dashboard component that manages all state, layouts, and page routing.
 * Implements internal SPA navigation with live network data updates.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/dashboard.css';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DashboardState {
  activeSection: string;
  blockHeight: number;
  tps: number;
  countdown: { days: number; hours: number; minutes: number; seconds: number };
  mining: boolean;
  mined: number;
  commandPaletteOpen: boolean;
  notificationOpen: boolean;
  userMenuOpen: boolean;
  lightMode: boolean;
  toastVisible: boolean;
  toastMessage: string;
  buyUsd: string;
  searchQuery: string;
  // Task 24.2: Demo mode indicators
  demoMode: boolean;
  networkConnected: boolean;
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
  { label: 'Mining', id: 'mining', section: 'CORE', icon: '⛏️' },
  { label: 'Marketplace', id: 'marketplace', section: 'ECOSYSTEM', icon: '🏪' },
  // ECOSYSTEM section
  { label: 'Mines', id: 'mines', section: 'ECOSYSTEM', icon: '🌍' },
  { label: 'Governance', id: 'governance', section: 'ECOSYSTEM', icon: '🗳️' },
  { label: 'Validators', id: 'validators', section: 'ECOSYSTEM', icon: '✓' },
  { label: 'Explorer', id: 'explorer', section: 'ECOSYSTEM', icon: '🔍' },
  // DEVELOPER section
  { label: 'Smart Contracts', id: 'contracts', section: 'DEVELOPER', icon: '<>' },
  { label: 'DevHub', id: 'devhub', section: 'DEVELOPER', icon: '👨‍💻' },
];

/**
 * Sample data for slips (transactions)
 */
const INITIAL_SLIPS: SlipItem[] = [
  {
    id: '1',
    type: 'Sent',
    detail: 'to mall1x7fk29zq0e4d2...',
    when: '2 mins ago',
    amount: -150.5,
    amountClass: 'amt-neg',
  },
  {
    id: '2',
    type: 'Received',
    detail: 'from mining rewards',
    when: '1 hour ago',
    amount: 12.5,
    amountClass: 'amt-pos',
  },
  {
    id: '3',
    type: 'Fee',
    detail: 'network transaction',
    when: '2 hours ago',
    amount: -0.006,
    amountClass: 'amt-warn',
  },
  {
    id: '4',
    type: 'Swap',
    detail: 'MALL ↔ USDC',
    when: '5 hours ago',
    amount: 0,
    amountClass: 'amt-info',
  },
  {
    id: '5',
    type: 'Staked',
    detail: 'validator rewards',
    when: '1 day ago',
    amount: 24.3,
    amountClass: 'amt-pos',
  },
];

/**
 * Sample activity feed data
 */
const INITIAL_ACTIVITY_FEED: ActivityFeedItem[] = [
  {
    id: '1',
    title: 'Network Upgrade',
    subtitle: 'v2.1.0 deployed',
    time: 'Just now',
    icon: '🚀',
    color: 'amber',
  },
  {
    id: '2',
    title: 'Mining Reward',
    subtitle: '+12.5 MALL earned',
    time: '12 mins ago',
    icon: '⛏️',
    color: 'green',
  },
  {
    id: '3',
    title: 'Governance Vote',
    subtitle: 'Proposal #42 passed',
    time: '2 hours ago',
    icon: '🗳️',
    color: 'purple',
  },
  {
    id: '4',
    title: 'Node Status',
    subtitle: 'Validator back online',
    time: '5 hours ago',
    icon: '✓',
    color: 'blue',
  },
  {
    id: '5',
    title: 'Alert',
    subtitle: 'High gas prices detected',
    time: '1 day ago',
    icon: '⚠️',
    color: 'red',
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MallchainDashboard() {
  // ========================================================================
  // STATE MANAGEMENT (Task 2.3)
  // ========================================================================

  const [state, setState] = useState<DashboardState>({
    activeSection: 'dashboard',
    blockHeight: 1523457,
    tps: 1250,
    countdown: { days: 7, hours: 12, minutes: 45, seconds: 36 },
    mining: false,
    mined: 0,
    commandPaletteOpen: false,
    notificationOpen: false,
    userMenuOpen: false,
    lightMode: false,
    toastVisible: false,
    toastMessage: '',
    buyUsd: '',
    searchQuery: '',
    // Task 24.2: Demo mode enabled by default (will be removed in Priority 2 when real data tested)
    demoMode: true,
    networkConnected: false,
  });

  const [slips] = useState<SlipItem[]>(INITIAL_SLIPS);
  const [activityFeed] = useState<ActivityFeedItem[]>(INITIAL_ACTIVITY_FEED);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ========================================================================
  // EFFECTS - Live Data & Interactions (Tasks 2.4-2.9)
  // ========================================================================

  /**
   * Task 2.4: Live network data interval - updates every 4 seconds
   */
  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        blockHeight: prev.blockHeight + 1,
        tps: Math.floor(Math.random() * (1400 - 1150 + 1)) + 1150,
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Task 2.5: Countdown timer interval - ticks every second
   */
  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => {
        const { days, hours, minutes, seconds } = prev.countdown;

        if (seconds > 0) {
          return {
            ...prev,
            countdown: { days, hours, minutes, seconds: seconds - 1 },
          };
        }

        if (minutes > 0) {
          return {
            ...prev,
            countdown: { days, hours, minutes: minutes - 1, seconds: 59 },
          };
        }

        if (hours > 0) {
          return {
            ...prev,
            countdown: { days, hours: hours - 1, minutes: 59, seconds: 59 },
          };
        }

        if (days > 0) {
          return {
            ...prev,
            countdown: { days: days - 1, hours: 23, minutes: 59, seconds: 59 },
          };
        }

        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Task 2.6: Mining simulation interval
   */
  useEffect(() => {
    if (!state.mining) return;

    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        mined: prev.mined + (Math.random() * 0.02),
      }));
    }, 300);

    return () => clearInterval(interval);
  }, [state.mining]);

  /**
   * Task 2.7: Keyboard shortcut handler for ⌘K and Escape
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setState((prev) => ({ ...prev, commandPaletteOpen: true }));
      }

      // Escape to close command palette
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

  /**
   * Task 2.8: Outside click handler for dropdowns
   */
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

  /**
   * Task 2.9: Toast auto-hide after 2600ms
   */
  useEffect(() => {
    if (!state.toastVisible) return;

    const timeout = setTimeout(() => {
      setState((prev) => ({ ...prev, toastVisible: false }));
    }, 2600);

    return () => clearTimeout(timeout);
  }, [state.toastVisible]);

  // ========================================================================
  // HELPER FUNCTIONS (Task 2.10)
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
    // Scroll to top on page change
    window.scrollTo(0, 0);
  }, []);

  const toggleMining = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mining: !prev.mining,
    }));
  }, []);

  const calcBuy = useCallback((usdAmount: string): string => {
    const usd = parseFloat(usdAmount);
    if (isNaN(usd)) return '';
    return (usd / 1.019).toFixed(2);
  }, []);

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
                onNavigate={goToPage}
                showToast={showToast}
              />
            )}

            {/* Wallet Page */}
            {state.activeSection === 'wallet' && (
              <WalletPage slips={slips} />
            )}

            {/* Send Page */}
            {state.activeSection === 'send' && (
              <SendPage onSubmit={() => showToast('Transaction broadcast — MALL sent')} />
            )}

            {/* Receive Page */}
            {state.activeSection === 'receive' && (
              <ReceivePage showToast={showToast} />
            )}

            {/* Buy Page */}
            {state.activeSection === 'buy' && (
              <BuyPage
                buyUsd={state.buyUsd}
                onUsdChange={(value) => setState((prev) => ({ ...prev, buyUsd: value }))}
                calcBuy={calcBuy}
                showToast={showToast}
              />
            )}

            {/* Mining Page */}
            {state.activeSection === 'mining' && (
              <MiningPage
                mining={state.mining}
                mined={state.mined}
                onToggleMining={toggleMining}
              />
            )}

            {/* Marketplace Page */}
            {state.activeSection === 'marketplace' && <MarketplacePage />}

            {/* Mines Page */}
            {state.activeSection === 'mines' && <MinesPage />}

            {/* Governance Page */}
            {state.activeSection === 'governance' && (
              <GovernancePage showToast={showToast} />
            )}

            {/* Validators Page */}
            {state.activeSection === 'validators' && <ValidatorsPage />}

            {/* Explorer Page */}
            {state.activeSection === 'explorer' && (
              <ExplorerPage blockHeight={state.blockHeight} />
            )}

            {/* Contracts Page */}
            {state.activeSection === 'contracts' && <ContractsPage />}

            {/* DevHub Page */}
            {state.activeSection === 'devhub' && <DevHubPage />}
          </div>

          {/* Right Rail (Dashboard Only) */}
          {state.activeSection === 'dashboard' && (
            <RightRail
              countdown={state.countdown}
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
}

function DashboardSidebar({
  activeSection,
  blockHeight,
  onNavigate,
  userMenuOpen,
  onToggleUserMenu,
}: DashboardSidebarProps) {
  return (
    <aside className="dashboard-sidebar">
      {/* Brand Section (3.2-3.3) */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">M</div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">MALLCHAIN</div>
          <div className="sidebar-brand-badge">BETA</div>
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
          <span>Ian M</span>
          <span>▼</span>
        </button>
        {userMenuOpen && (
          <div className="dropdown-menu">
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
}

function DashboardHeader({
  onSearch,
  onOpenCommandPalette,
  onToggleNotifications,
  onToggleTheme,
  notificationOpen,
  lightMode,
  dropdownRef,
}: DashboardHeaderProps) {
  return (
    <header className="dashboard-header" ref={dropdownRef}>
      {/* Greeting (4.2-4.3) */}
      <div className="header-greeting">
        <span className="header-greeting-emoji">👋</span>
        <div>
          <div className="header-greeting-text">Good afternoon, Ian</div>
          <div className="header-shortcut" style={{ fontSize: '12px', color: '#9ca3af' }}>
            Mallchain mainnet • {/* Task 24.2: Demo mode indicator */}
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>DEMO MODE</span> • All systems healthy
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
              <button className="dropdown-item">Mining rewards +12.5 MALL</button>
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
  onNavigate: (page: string) => void;
  showToast: (msg: string) => void;
}

function DashboardPage({
  blockHeight,
  tps,
  slips,
  onNavigate,
  showToast,
}: DashboardPageProps) {
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
          {state.demoMode && (
            <span
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                borderRadius: '6px',
                fontWeight: 600,
                border: '1px solid rgba(245, 158, 11, 0.4)',
              }}
            >
              DEMO MODE - Simulated Data
            </span>
          )}
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

  // Stat cards (Task 8)
  const statCards = (
    <div className="grid-4col">
      {[
        { label: 'Wallet Balance', value: '1,250.50 MALL', tag: 'green', icon: '💼', demo: true },
        { label: "Today's Earnings", value: '+24.50 MALL', tag: 'amber', icon: '📊', demo: true },
        { label: 'Sales Today', value: '3 orders', tag: 'red', icon: '🛒', demo: true },
        { label: 'Waiting on You', value: '2 actions', tag: 'purple', icon: '✓', demo: true },
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
            <span>+2.5% from yesterday</span>
            {card.demo && state.demoMode && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                Demo
              </span>
            )}
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
                {slip.amount > 0 ? '+' : ''}{slip.amount.toFixed(2)}
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
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>This Week</h3>
            <span
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                background: 'rgba(139, 92, 246, 0.1)',
                color: '#8b5cf6',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              WEEK
            </span>
          </div>
          {[
            { label: 'Mining Income', amount: 45.2 },
            { label: 'Marketplace', amount: 120.5 },
            { label: 'Fees', amount: -2.1 },
            { label: 'Total', amount: 163.6, bold: true },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 3 ? '1px solid #2a2d3a' : 'none',
                fontWeight: item.bold ? 600 : 400,
              }}
            >
              <span>{item.label}</span>
              <span style={{ color: item.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                {item.amount > 0 ? '+' : ''}{item.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions (Task 10) */}
      <div style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '12px',
          }}
        >
          {[
            { label: 'Send', id: 'send', icon: '📤', primary: true },
            { label: 'Receive', id: 'receive', icon: '📥', primary: false },
            { label: 'Buy', id: 'buy', icon: '💳', primary: false },
            { label: 'Mining', id: 'mining', icon: '⛏️', primary: false },
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

      {/* Promo Card (Task 10) */}
      <div
        className="card"
        style={{
          marginTop: '24px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
          color: 'white',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
          New Dashboard Available
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', opacity: 0.9 }}>
          Upgrade to the latest version with improved performance and new features
        </p>
        <div style={{ fontSize: '24px', fontWeight: 700 }}>v2.0.0</div>
      </div>
    </div>
  );
}

// ============================================================================
// RIGHT RAIL COMPONENT (Task 11)
// ============================================================================

interface RightRailProps {
  countdown: { days: number; hours: number; minutes: number; seconds: number };
  activityFeed: ActivityFeedItem[];
  onNavigate: (page: string) => void;
  showToast: (msg: string) => void;
}

function RightRail({
  countdown,
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
            { label: 'Mine', id: 'mining', icon: '⛏️' },
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

      {/* Countdown (11.7-11.10) */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          color: 'white',
          marginTop: '12px',
        }}
      >
        <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '12px' }}>
          ✓ Mallpoints Conversion
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}
        >
          {[
            { label: 'DAYS', value: countdown.days },
            { label: 'HRS', value: countdown.hours },
            { label: 'MINS', value: countdown.minutes },
            { label: 'SECS', value: countdown.seconds },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                textAlign: 'center',
                padding: '8px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>
                {String(item.value).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>
                {item.label}
              </div>
            </div>
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

function WalletPage({ slips }: { slips: SlipItem[] }) {
  return (
    <div>
      <div className="card">
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
          1,250.50 MALL
        </h2>
        <div style={{ fontSize: '14px', color: '#9ca3af' }}>
          ≈ $1,274.89 USD
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
          Activity
        </h3>
        <table className="table">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Type</th>
              <th className="table-header-cell">Detail</th>
              <th className="table-header-cell">When</th>
              <th className="table-header-cell right-align">Amount</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((slip) => (
              <tr key={slip.id} className="table-body-row">
                <td className="table-body-cell">{slip.type}</td>
                <td className="table-body-cell">{slip.detail}</td>
                <td className="table-body-cell">{slip.when}</td>
                <td
                  className={`table-body-cell right-align ${slip.amountClass.replace(
                    'amt-',
                    ''
                  )}`}
                >
                  {slip.amount > 0 ? '+' : ''}{slip.amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SendPage({ onSubmit }: { onSubmit: () => void }) {
  const [formData, setFormData] = React.useState({ recipient: '', amount: '' });

  return (
    <div className="card" style={{ maxWidth: '460px' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Send MALL
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
          setFormData({ recipient: '', amount: '' });
        }}
      >
        <div className="form-group">
          <label className="form-label">Recipient Address</label>
          <input
            type="text"
            className="form-input"
            placeholder="mall1..."
            value={formData.recipient}
            onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Amount</label>
          <input
            type="number"
            className="form-input"
            placeholder="0.00"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Network Fee</label>
          <input
            type="text"
            className="form-input"
            value="0.0006 MALL (~$0.0004)"
            disabled
          />
        </div>

        <button type="submit" className="button button-primary button-large" style={{ width: '100%' }}>
          Send Transaction
        </button>
      </form>
    </div>
  );
}

function ReceivePage({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <div className="card" style={{ maxWidth: '460px', textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Receive MALL
      </h2>

      <div
        style={{
          width: '180px',
          height: '180px',
          background: 'white',
          margin: '0 auto 24px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          fontSize: '12px',
        }}
      >
        QR CODE
      </div>

      <div
        style={{
          background: '#1a1d29',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          marginBottom: '24px',
          wordBreak: 'break-all',
        }}
      >
        mall1x7fk29zq0e4d2nvhslx9c6m
      </div>

      <button
        className="button button-primary"
        onClick={() => {
          navigator.clipboard.writeText('mall1x7fk29zq0e4d2nvhslx9c6m');
          showToast('Address copied to clipboard');
        }}
        style={{ width: '100%' }}
      >
        Copy Address
      </button>
    </div>
  );
}

function BuyPage({
  buyUsd,
  onUsdChange,
  calcBuy,
  showToast,
}: {
  buyUsd: string;
  onUsdChange: (value: string) => void;
  calcBuy: (usd: string) => string;
  showToast: (msg: string) => void;
}) {
  return (
    <div className="card" style={{ maxWidth: '460px' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Buy MALL
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          showToast('Order placed — MALL purchase pending');
          onUsdChange('');
        }}
      >
        <div className="form-group">
          <label className="form-label">USD Amount</label>
          <input
            type="number"
            className="form-input"
            placeholder="100.00"
            value={buyUsd}
            onChange={(e) => onUsdChange(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">MALL Amount</label>
          <input
            type="text"
            className="form-input"
            value={calcBuy(buyUsd)}
            disabled
          />
        </div>

        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <select className="form-select">
            <option>Credit Card</option>
            <option>Bank Transfer</option>
            <option>PayPal</option>
          </select>
        </div>

        <button type="submit" className="button button-primary button-large" style={{ width: '100%' }}>
          Place Order
        </button>
      </form>
    </div>
  );
}

function MiningPage({
  mining,
  mined,
  onToggleMining,
}: {
  mining: boolean;
  mined: number;
  onToggleMining: () => void;
}) {
  return (
    <div>
      <div className="grid-3col">
        {[
          { label: 'Hash Power', value: '42.8 TH/s', icon: '⚡' },
          { label: 'Active Mines', value: '3', icon: '⛏️' },
          { label: 'Pending Rewards', value: '+50 MALL', icon: '💰' },
        ].map((stat, i) => (
          <div key={i} className="card stat-card">
            <div className="stat-card-label">
              <div className="stat-card-icon green">{stat.icon}</div>
              <span className="stat-card-label-text">{stat.label}</span>
            </div>
            <div className="stat-card-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: '24px', textAlign: 'center', maxWidth: '460px' }}>
        <div style={{ fontSize: '48px', fontWeight: 700, marginBottom: '12px' }}>
          {mined.toFixed(3)}
        </div>
        <div style={{ color: '#9ca3af', marginBottom: '24px' }}>MALL Mined</div>
        <button
          className={`button ${mining ? 'button-secondary' : 'button-primary'}`}
          onClick={onToggleMining}
          style={{ width: '100%' }}
        >
          {mining ? 'Stop Mining' : 'Start Mining'}
        </button>
      </div>
    </div>
  );
}

function MarketplacePage() {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Marketplace
      </h2>
      <table className="table">
        <thead className="table-header">
          <tr>
            <th className="table-header-cell">Item</th>
            <th className="table-header-cell">Seller</th>
            <th className="table-header-cell">Status</th>
            <th className="table-header-cell right-align">Price</th>
          </tr>
        </thead>
        <tbody>
          {[
            { item: 'Validator License', seller: 'Alice.mall', status: 'Completed', price: '250 MALL' },
            { item: 'Mining Rig', seller: 'Bob.mall', status: 'Awaiting pickup', price: '1,500 MALL' },
          ].map((row, i) => (
            <tr key={i} className="table-body-row">
              <td className="table-body-cell">{row.item}</td>
              <td className="table-body-cell">{row.seller}</td>
              <td className="table-body-cell">
                <span className={`status-pill ${row.status === 'Completed' ? 'green' : 'amber'}`}>
                  {row.status}
                </span>
              </td>
              <td className="table-body-cell right-align">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MinesPage() {
  return (
    <div className="grid-3col">
      {[
        { name: 'Mine Alpha', status: 'Online', yield: '12.4 MALL/day' },
        { name: 'Mine Beta', status: 'Online', yield: '9.1 MALL/day' },
        { name: 'Mine Gamma', status: 'Syncing', yield: '—' },
      ].map((mine, i) => (
        <div key={i} className="card">
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
            {mine.name}
          </h3>
          <div
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              background:
                mine.status === 'Online'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : 'rgba(245, 158, 11, 0.1)',
              color: mine.status === 'Online' ? '#22c55e' : '#f59e0b',
              borderRadius: '6px',
              marginBottom: '12px',
              display: 'inline-block',
              fontWeight: 600,
            }}
          >
            {mine.status}
          </div>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>
            Yield: {mine.yield}
          </div>
        </div>
      ))}
    </div>
  );
}

function GovernancePage({ showToast }: { showToast: (msg: string) => void }) {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Governance
      </h2>
      <table className="table">
        <thead className="table-header">
          <tr>
            <th className="table-header-cell">Proposal</th>
            <th className="table-header-cell">Status</th>
            <th className="table-header-cell">Action</th>
          </tr>
        </thead>
        <tbody>
          {[
            { proposal: 'Proposal #42: Increase block size', status: 'Vote needed' },
            { proposal: 'Proposal #41: Fee adjustment', status: 'Passed' },
          ].map((row, i) => (
            <tr key={i} className="table-body-row">
              <td className="table-body-cell">{row.proposal}</td>
              <td className="table-body-cell">
                <span
                  className={`status-pill ${
                    row.status === 'Passed' ? 'green' : 'amber'
                  }`}
                >
                  {row.status}
                </span>
              </td>
              <td className="table-body-cell">
                <button
                  className="button button-secondary"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => showToast('Vote submitted (demo)')}
                >
                  Vote
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidatorsPage() {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Validators
      </h2>
      <table className="table">
        <thead className="table-header">
          <tr>
            <th className="table-header-cell">Validator</th>
            <th className="table-header-cell">Status</th>
            <th className="table-header-cell right-align">Uptime</th>
          </tr>
        </thead>
        <tbody>
          {[
            { validator: 'Validator Alpha', status: 'Active', uptime: '99.8%' },
            { validator: 'Validator Beta', status: 'Back online', uptime: '98.2%' },
          ].map((row, i) => (
            <tr key={i} className="table-body-row">
              <td className="table-body-cell">{row.validator}</td>
              <td className="table-body-cell">
                <span className="status-pill green">{row.status}</span>
              </td>
              <td className="table-body-cell right-align">{row.uptime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExplorerPage({ blockHeight }: { blockHeight: number }) {
  return (
    <div className="card">
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>
        Block Explorer
      </h2>
      <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '16px' }}>
        Block height {blockHeight.toLocaleString()} · Network: Mainnet
      </div>
      <input
        type="text"
        className="form-input"
        placeholder="Search transaction hash..."
      />
    </div>
  );
}

function ContractsPage() {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        Smart Contracts
      </div>
      <div style={{ color: '#9ca3af' }}>
        No contracts deployed yet
      </div>
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
