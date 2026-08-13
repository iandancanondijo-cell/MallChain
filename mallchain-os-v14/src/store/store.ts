/**
 * Mallchain Mission Control v14 — shared reactive store.
 *
 * Mirrors the dashboard's `mallchain_os_v1` localStorage concept:
 *  - single source of truth, persisted to localStorage
 *  - pub/sub: subscribe(listener) fires on every mutation
 *  - applyTx: the ONE mutation path — validate → mutate balances →
 *    record transaction → notification → activity → notify subscribers
 *  - demo-mode seed gate: seeds are applied only when config.demoMode is
 *    true AND the store is empty; production starts empty.
 */
import { config } from '../services/config';

export const OS_KEY = 'mallchain_os_v1_v14';

/* ---------------- types ---------------- */

export interface Balance {
  MALL: number;
  MLPTS: number;
  USD_M: number;
  KES: number;
  EUR: number;
  GBP: number;
}

export interface Tx {
  id: string;
  type: string; // send | receive | swap | stake | unstake | reward | penalty | claim | escrow | ...
  amount: number;
  asset: string;
  status: 'pending' | 'confirmed' | 'failed';
  to?: string;
  from?: string;
  fee?: number;
  ts: number;
  note?: string;
}

export interface Notification {
  id: string;
  kind: 'tx' | 'system' | 'mines' | 'validators' | 'governance' | 'market' | 'social';
  title: string;
  body?: string;
  read: boolean;
  ts: number;
}

export interface Activity {
  id: string;
  text: string;
  icon?: string;
  ts: number;
}

export interface AppState {
  version: number;
  user: {
    authed: boolean;
    name: string;
    email: string;
    phone: string;
    avatarInitial: string;
    bio: string;
    frozen: boolean;
    kycLevel: number;
  };
  balances: Balance;
  txs: Tx[];
  notifications: Notification[];
  notifs: Array<{ id: string; ico: string; text: string; time: string; read: boolean; kind: string }>;
  activity: Activity[];
  prefs: {
    accent: 'gold' | 'cyan' | 'purple' | 'emerald';
    currency: 'USD' | 'KES' | 'EUR' | 'GBP';
    lang: 'EN' | 'FR' | 'ES' | 'SW';
  };
  settings: {
    theme: 'dark';
    demoMode: boolean;
    network: string;
  };
  wallet: {
    address: string;
    accountId: string;
    chainId: string;
    mnemonic: string;
    createdAt: number;
    requests: Array<{ id: string; amount: number; note: string; status: 'pending' | 'paid'; ts: number }>;
  };
  marketplace: {
    cart: Array<{ id: string; qty: number }>;
    wishlist: string[];
    orders: Array<{
      id: string;
      items: string[];
      total: number;
      status: 'processing' | 'shipped' | 'transit' | 'delivered' | 'cancelled' | 'disputed';
      ts: number;
    }>;
  };
  staking: {
    delegated: number;
    apy: number;
    pendingUnstake: number;
    cooldownEnds: number | null;
    history: Array<{ id: string; type: string; amount: number; ts: number }>;
  };
  governance: {
    proposals: Array<{
      id: string;
      title: string;
      body: string;
      options: string[];
      votes: number[];
      quorum: number;
      status: 'active' | 'pending' | 'passed' | 'defeated';
      comments: Array<{ author: string; text: string; ts: number }>;
      createdByMe: boolean;
      ts: number;
    }>;
  };
  mines: {
    campaigns: Campaign[];
    participations: Participation[];
    submissions: Submission[];
    earnings: Array<{ day: string; v: number }>;
    hist: Array<{ d: string; ev: Array<{ ico: string; t: string; s: string; a: number; pos: boolean }> }>;
    created: Array<{ id: string; name: string; budget: number; spent: number; status: string }>;
    campAnalytics: Record<string, { views: number; clicks: number; trend: number[] }>;
    pendCount: number;
  };
  validators: ValidatorsSlice;
  explorer: {
    blocks: Array<{ h: number; txs: number; ts: number; hash: string }>;
    txs: Array<{ hash: string; from: string; to: string; val: number; ts: number }>;
  };
  messaging: {
    conversations: Array<{
      id: string;
      name: string;
      messages: Array<{ from: 'me' | 'them'; text: string; ts: number; typing?: boolean }>;
      unread: number;
      typing: boolean;
    }>;
  };
  referrals: {
    code: string;
    earned: number;
    count: number;
    claimed: number;
  };
  admin: {
    flags: Record<string, boolean>;
    announcements: Array<{ id: string; text: string; ts: number }>;
  };
  contracts: Array<{ id: string; name: string; addr: string; type: string; txs: number }>;
  devhub: {
    keys: Array<{ id: string; name: string; key: string; used: number; created: string }>;
  };
  careers: {
    list: Array<{ title: string; dept: string; loc: string; applied: boolean }>;
  };
  learning: boolean[];
  socialTasks: boolean[];
}

export interface Campaign {
  id: string;
  name: string;
  creator: string;
  reward: number;
  platform: string;
  participants: number;
  max: number;
  remaining: number;
  diff: 'Easy' | 'Medium' | 'Hard';
  eta: string;
  validators: number;
  verified: boolean;
  desc: string;
  conf: number;
  completion: number;
  avgApprove: string;
  rpm: number;
  reputation: number;
  trust: number;
  country: string;
  budget?: number;
  spent?: number;
}

export interface Participation {
  id: string;
  campaign: string;
  status: 'inprogress' | 'pending' | 'approved' | 'rejected';
  steps: number;
  ts: string;
  reward: number;
  appealAvailable?: boolean;
  rejectReason?: string;
}

export interface Submission {
  id: string;
  pid: string;
  campaign: string;
  wallet: string;
  ai: number;
  human: number;
  need: number;
  status: 'voting' | 'approved' | 'rejected';
  reason: string | null;
  reward: number;
  plat: string;
  appealOf?: string;
}

export interface ValidatorsSlice {
  application: Record<string, unknown> | null;
  eligibility: { checks: Array<{ ok: boolean; label: string }>; eligible: boolean; ts: string } | null;
  stakeLocked: number;
  stakeTx: string | null;
  training: { score: number; passed: boolean; attempts: number; ts: string } | null;
  approval: { start: string; ends: string; approved: boolean } | null;
  daily: {
    reviewed: number;
    approved: number;
    rejected: number;
    matched: number;
    incorrect: number;
    reward: number;
  };
  reputation: { accuracy: number; votes: number; correct: number; incorrect: number; fraud: number; speed: number; trust: number; rank: string };
  strikes: number;
  weekly: Array<{ w: string; reviewed: number; approved: number; matched: number; reward: number; acc: number }>;
  reviews: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  calculator: {
    mode: 'projection' | 'breakeven';
    inputs: { reviews: number; days: number; acc: number; penalty: boolean; strike: boolean; cons: number };
    stake: number;
    result: { gross: number; net: number; mult: number; tier: number; repEnd: number; effective: number };
  };
  rewardsLeaderboard: { validators: Array<Record<string, unknown>>; ts: number };
}

/* ---------------- base state ---------------- */

function emptyState(): AppState {
  return {
    version: 14,
    user: {
      authed: false,
      name: 'Campaign Participant',
      email: '',
      phone: '',
      avatarInitial: 'C',
      bio: '',
      frozen: false,
      kycLevel: 1,
    },
    balances: { MALL: 0, MLPTS: 0, USD_M: 0, KES: 0, EUR: 0, GBP: 0 },
    txs: [],
    notifications: [],
    activity: [],
    prefs: { accent: 'gold', currency: 'USD', lang: 'EN' },
    settings: { theme: 'dark', demoMode: config.demoMode, network: config.network },
    wallet: { address: '', accountId: '', chainId: '', mnemonic: '', createdAt: 0, requests: [] },
    marketplace: { cart: [], wishlist: [], orders: [] },
    staking: { delegated: 0, apy: 12.4, pendingUnstake: 0, cooldownEnds: null, history: [] },
    governance: { proposals: [] },
    mines: {
      campaigns: [],
      participations: [],
      submissions: [],
      earnings: [],
      hist: [],
      created: [],
      campAnalytics: {},
      pendCount: 324,
    },
    validators: emptyValidators(),
    explorer: { blocks: [], txs: [] },
    messaging: { conversations: [] },
    referrals: { code: 'MALL-KE-' + Math.random().toString(36).slice(2, 8).toUpperCase(), earned: 0, count: 0, claimed: 0 },
    admin: { flags: {}, announcements: [] },
    notifs: [],
    contracts: [],
    devhub: { keys: [] },
    careers: { list: [
      { title: 'Senior Frontend Engineer', dept: 'Engineering', loc: 'Remote · Nairobi', applied: false },
      { title: 'Smart Contract Developer', dept: 'Engineering', loc: 'Remote', applied: false },
      { title: 'Community Manager', dept: 'Growth', loc: 'Remote · East Africa', applied: false },
      { title: 'QA Automation Engineer', dept: 'Engineering', loc: 'Remote', applied: false },
      { title: 'Product Designer', dept: 'Design', loc: 'Remote', applied: false },
    ] },
    learning: [false, false, false, false],
    socialTasks: [false, false, false, false],
  };
}

function emptyValidators(): ValidatorsSlice {
  return {
    application: null,
    eligibility: null,
    stakeLocked: 0,
    stakeTx: null,
    training: null,
    approval: null,
    daily: { reviewed: 0, approved: 0, rejected: 0, matched: 0, incorrect: 0, reward: 0 },
    reputation: { accuracy: 0, votes: 0, correct: 0, incorrect: 0, fraud: 0, speed: 0, trust: 0, rank: 'Unranked' },
    strikes: 0,
    weekly: [],
    reviews: [],
    assignments: [],
    calculator: {
      mode: 'projection',
      inputs: { reviews: 20, days: 26, acc: 92, penalty: true, strike: true, cons: 85 },
      stake: 500,
      result: { gross: 0, net: 0, mult: 1, tier: 0, repEnd: 92, effective: 100 },
    },
    rewardsLeaderboard: { validators: [], ts: 0 },
  };
}

/* ---------------- store ---------------- */

class Store {
  state: AppState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = this.load();
  }

  private load(): AppState {
    try {
      const raw = localStorage.getItem(OS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed && parsed.version === 14) {
          return this.merge(parsed);
        }
      }
    } catch {
      /* corrupted store — start fresh */
    }
    const fresh = emptyState();
    
    // Task 4.8: Sync auth state with localStorage token on initial load
    try {
      const token = localStorage.getItem('token');
      if (token) {
        // Token exists in localStorage, mark user as authenticated
        fresh.user.authed = true;
      } else {
        // No token in localStorage, ensure auth state is false
        fresh.user.authed = false;
      }
    } catch {
      /* localStorage unavailable — leave auth state as default (false) */
      fresh.user.authed = false;
    }
    
    this.persist();
    return fresh;
  }

  private merge(saved: AppState): AppState {
    const base = emptyState();
    const out: AppState = {
      ...base,
      ...saved,
      user: { ...base.user, ...saved.user },
      balances: { ...base.balances, ...saved.balances },
      prefs: { ...base.prefs, ...saved.prefs },
      settings: { ...base.settings, ...saved.settings },
      wallet: { ...base.wallet, ...saved.wallet },
      marketplace: { ...base.marketplace, ...saved.marketplace },
      staking: { ...base.staking, ...saved.staking },
      governance: { ...base.governance, ...saved.governance },
      mines: { ...base.mines, ...saved.mines },
      validators: { ...base.validators, ...saved.validators },
      explorer: { ...base.explorer, ...saved.explorer },
      messaging: { ...base.messaging, ...saved.messaging },
      referrals: { ...base.referrals, ...saved.referrals },
      admin: { ...base.admin, ...saved.admin },
    };
    return out;
  }

  persist() {
    try {
      localStorage.setItem(OS_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full/unavailable */
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Internal: notify subscribers + persist. All mutations go through this. */
  commit() {
    this.persist();
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* listener error must not break the store */
      }
    });
  }

  /** The one mutation path: validate → mutate → tx → notification → activity → commit. */
  applyTx(opts: {
    type: string;
    amount: number;
    asset: keyof Balance;
    kind: 'credit' | 'debit';
    to?: string;
    from?: string;
    fee?: number;
    note?: string;
    notifTitle?: string;
    notifKind?: Notification['kind'];
    activityText?: string;
    status?: Tx['status'];
  }): { ok: boolean; error?: string; tx?: Tx } {
    const b = this.state.balances;
    if (opts.kind === 'debit' && b[opts.asset] < opts.amount) {
      return { ok: false, error: `Insufficient ${opts.asset} balance` };
    }
    const prev = b[opts.asset];
    b[opts.asset] = opts.kind === 'credit' ? prev + opts.amount : prev - opts.amount;
    const tx: Tx = {
      id: 'tx' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      type: opts.type,
      amount: opts.amount,
      asset: opts.asset,
      status: opts.status || 'confirmed',
      to: opts.to,
      from: opts.from,
      fee: opts.fee,
      note: opts.note,
      ts: Date.now(),
    };
    this.state.txs.unshift(tx);
    if (this.state.txs.length > 200) this.state.txs.length = 200;
    if (opts.notifTitle) {
      this.pushNotification(opts.notifTitle, opts.note || '', opts.notifKind || 'tx');
    }
    if (opts.activityText) {
      this.state.activity.unshift({ id: 'act' + Date.now().toString(36), text: opts.activityText, ts: Date.now() });
      if (this.state.activity.length > 60) this.state.activity.length = 60;
    }
    this.commit();
    return { ok: true, tx };
  }

  credit(asset: keyof Balance, amount: number, type = 'credit', note?: string) {
    return this.applyTx({ type, amount, asset, kind: 'credit', note });
  }

  debit(asset: keyof Balance, amount: number, type = 'debit', note?: string) {
    return this.applyTx({ type, amount, asset, kind: 'debit', note });
  }

  pushNotification(title: string, body = '', kind: Notification['kind'] = 'system') {
    this.state.notifications.unshift({ id: 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), kind, title, body, read: false, ts: Date.now() });
    if (this.state.notifications.length > 80) this.state.notifications.length = 80;
  }

  reset() {
    localStorage.removeItem(OS_KEY);
    this.state = emptyState();
    if (this.state.settings.demoMode && this.state.mines.campaigns.length === 0) {
      // reseed happens via the demo gate on next render
    }
    this.commit();
  }
}

export const store = new Store();
export type { Balance as BalanceShape };
export const balanceKeys: (keyof Balance)[] = ['MALL', 'MLPTS', 'USD_M', 'KES', 'EUR', 'GBP'];