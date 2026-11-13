/**
 * Mallchain Mission Control v14 — shared reactive store.
 *
 * Mirrors the dashboard's `mallchain_os_v1` localStorage concept:
 *  - single source of truth, persisted to localStorage
 *  - pub/sub: subscribe(listener) fires on every mutation
 *  - applyTx: the ONE mutation path — validate → mutate balances →
 *    record transaction → notification → activity → notify subscribers
 *  - store starts empty; every module reads real data from the backend.
 */
import { config } from '../services/config';
import { detectDefaultCurrency } from '../services/locale';
import { ADDRESS_BOOK_STORAGE_KEY } from '../services/addressBookStore';
// Type-only: the runtime modules stay behind the dynamic import in
// pushNotification, so this never joins the api → auth → store cycle.
import type { NotifCategory, NotifKind } from '../services/notificationsApi';
import type { LocalOrder } from '../services/marketplaceOrders';

export const OS_KEY = 'mallchain_os_v1_v14';
export const WALLET_VAULT_STORAGE_KEY = 'mallchain_vault';

/**
 * Security model for wallet secrets:
 *
 *   st.wallet.pinEncryptedMnemonic — the recovery phrase encrypted with
 *     the user's wallet secret via AES-256-GCM (PBKDF2-SHA256, 250k
 *     iterations, fresh random salt + IV per encryption —
 *     services/security.ts). Since the Crypt Cipher Wall replaced numeric
 *     PINs the secret is the ordered glyph sequence the user engraved
 *     (st.wallet.secretMode === 'cipher'); wallets enrolled before that
 *     switch keep working with their digits (secretMode === '').
 *     PERSISTED to localStorage alongside the rest of the store so the
 *     wallet survives a browser refresh; without this the user is locked
 *     out of every signing operation the moment they reload, and the
 *     modal misreports it as a never-ending "wrong cipher".
 *
 *   st.wallet.pinHash — bcrypt(10) hash of the same secret. PERSISTED too
 *     — it's what the local verifyPin() fallback checks before the modal
 *     attempts the expensive PBKDF2/AES-GCM decrypt, and what the server
 *     mirrors for rate-limited verification. Both fields are useless
 *     without the secret itself: PBKDF2 × 250k makes guessing offline
 *     infeasible, and AES-GCM's auth tag rejects tampered ciphertext
 *     before any plaintext is exposed. The 24-word phrase backup (held by
 *     the user, never written anywhere we can read) remains the recovery
 *     path if the cipher itself is lost.
 *
 *   Plaintext mnemonic (st.wallet.mnemonic) is still stripped from
 *     localStorage — it's only ever populated by legacy wallets awaiting
 *     encryption migration, and features/wallet/credentialSave.ts wipes it the
 *     moment a cipher has been proven to open the encrypted copy.
 *
 *   The in-memory `memoryWalletSecrets` mirror below is kept for fast
 *   reads and as a fallback in applyExternalState; localStorage remains
 *   the source of truth, written through persistMainStore() on every
 *   commit and rehydrated by Store.load() on the next page load.
 */
interface WalletSecrets {
  pinEncryptedMnemonic: string;
  pinHash: string;
}
let memoryWalletSecrets: WalletSecrets | null = null;

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

export interface Activity {
  id: string;
  text: string;
  icon?: string;
  ts: number;
}

export interface AppState {
  version: number;
  user: {
    id: string;
    authed: boolean;
    name: string;
    email: string;
    phone: string;
    avatarInitial: string;
    avatarUrl: string | null;
    bio: string;
    frozen: boolean;
    frozenReason: string | null;
    kycLevel: number;
    role: 'user' | 'admin' | 'superadmin';
    hasBadge: boolean;
    // Set on login when role==='admin'. null for superadmin/users. Used by
    // AdminApp to land category admins directly in their category window
    // and gate the Reports UI on its own category.
    adminCategory: 'users' | 'blockchain' | 'validator' | 'kyc' | 'mining' | 'treasury' | 'marketplace' | 'mlpts' | 'reports' | null;
  };
  balances: Balance;
  txs: Tx[];
  activity: Activity[];
  prefs: {
    accent: 'gold' | 'cyan' | 'purple' | 'emerald';
    /** Any real ISO 4217 code — see services/locale.ts for auto-detection and services/currency.ts for conversion. */
    currency: string;
    lang: 'EN' | 'FR' | 'ES' | 'SW';
  };
  settings: {
    theme: 'dark';
    network: string;
  };
  wallet: {
    address: string;
    accountId: string;
    chainId: string;
    /**
     * Legacy field — new wallets never write a plaintext mnemonic here at
     * all (see features/wallet/credentialSave.ts and
     * services/mnemonicAccess.ts). Only ever non-empty for an account
     * created before PIN-gating existed; CipherChallenge.tsx detects that
     * on the next request for the key and migrates it into
     * pinEncryptedMnemonic (with Security Settings offering the same flow on
     * demand), then clears this field. Never read this directly for signing —
     * use requestMnemonic() instead.
     */
    mnemonic: string;
    createdAt: number;
    requests: Array<{ id: string; amount: number; note: string; status: 'pending' | 'paid'; ts: number }>;
    /** bcrypt hash of the wallet PIN; empty string if no PIN has been set yet (only possible pre-migration). */
    pinHash: string;
    /** The real, canonical mnemonic storage — PIN-encrypted (services/security.ts encryptMnemonic). Decrypted on demand via requestMnemonic(), never held in plaintext in the store. */
    pinEncryptedMnemonic: string;
    /**
     * Which secret protects the key material above:
     *   'cipher' — a Crypt Cipher Wall glyph sequence (services/security.ts
     *              validateSecretFormat); pinEncryptedMnemonic/pinHash are
     *              derived from that string.
     *   ''       — legacy 4-8 digit PIN (pre-Cipher-Wall wallets, or not yet
     *              set). Digits still verify everywhere; Security Settings
     *              offers the one-time migration to a cipher.
     * Not itself secret — safe to keep in the plain localStorage copy.
     */
    secretMode: '' | 'cipher';
    /**
     * True only when the backend has CONFIRMED that this exact local wallet
     * address is linked to the signed-in account (User.walletAddress) —
     * seeded from GET /api/auth/me at boot and set by a successful
     * POST /api/auth/link-wallet (services/auth.ts linkWallet). A locally
     * present address is NOT enough: /api/send/* rejects broadcasts with
     * 403 wallet_not_linked unless the server link exists, so the "Connected"
     * badges key off this flag, not just st.wallet.address.
     */
    linkedOnServer: boolean;
  };
  marketplace: {
    cart: Array<{ id: string; qty: number }>;
    wishlist: string[];
    // LocalOrder is the storefront's row: a purchase as this browser knows it,
    // which may be the server's receipt (recorded: true, id MLC-YYMMDD-…) or a
    // device-local one (id ord-…) when the account record could not be saved.
    // Fund custody is never in here — it is the x/marketplace escrow named by
    // escrowId (services/marketplaceTx.ts).
    orders: LocalOrder[];
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
  contracts: Array<{ id: string; name: string; addr: string; type: string; txs: number }>;
  learning: boolean[];
  socialTasks: boolean[];
  /** Durable-tier in-progress wizard/flow state, keyed by flow id. See hooks/useWizard.ts. */
  flows: Record<string, { step: string; data: Record<string, unknown>; updatedAt: number }>;
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
  /** In-progress quiz position, separate from `training` (which only holds a completed attempt's result). */
  trainingInProgress: { idx: number; score: number } | null;
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
      id: '',
      authed: false,
      name: '',
      email: '',
      phone: '',
      avatarInitial: 'C',
      avatarUrl: null,
      bio: '',
      frozen: false,
      frozenReason: null,
      kycLevel: 1,
      role: 'user',
      hasBadge: false,
      // 'adminCategory' is set on login when role==='admin'. null for
      // superadmin/users. AdminApp uses this to land them directly in their
      // category window — category admins cannot navigate to other
      // categories, the route simply doesn't exist for them.
      adminCategory: null,
    },
    balances: { MALL: 0, MLPTS: 0, USD_M: 0, KES: 0, EUR: 0, GBP: 0 },
    txs: [],
    activity: [],
    prefs: { accent: 'gold', currency: detectDefaultCurrency(), lang: 'EN' },
    settings: { theme: 'dark', network: config.network },
    wallet: { address: '', accountId: '', chainId: '', mnemonic: '', createdAt: 0, requests: [], pinHash: '', pinEncryptedMnemonic: '', secretMode: '', linkedOnServer: false },
    marketplace: { cart: [], wishlist: [], orders: [] },
    staking: { delegated: 0, apy: 0, pendingUnstake: 0, cooldownEnds: null, history: [] },
    governance: { proposals: [] },
    mines: {
      campaigns: [],
      participations: [],
      submissions: [],
      earnings: [],
      hist: [],
      created: [],
      campAnalytics: {},
      pendCount: 0,
    },
    validators: emptyValidators(),
    explorer: { blocks: [], txs: [] },
    messaging: { conversations: [] },
    referrals: { code: '', earned: 0, count: 0, claimed: 0 },
    contracts: [],
    learning: [false, false, false, false],
    socialTasks: [false, false, false, false],
    flows: {},
  };
}

function emptyValidators(): ValidatorsSlice {
  return {
    application: null,
    eligibility: null,
    stakeLocked: 0,
    stakeTx: null,
    training: null,
    trainingInProgress: null,
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
  /**
   * Why the last localStorage read or write failed, or null when storage is
   * healthy. Screens consult this before claiming anything was saved: the
   * in-memory state is always whatever was just assigned, so it cannot
   * answer whether the browser kept it.
   */
  storageError: string | null = null;

  constructor() {
    this.state = this.load();
  }

  private load(): AppState {
    let parsed: AppState | null = null;
    try {
      const raw = localStorage.getItem(OS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as AppState;
        if (p && p.version === 14) {
          parsed = p;
        }
      }
    } catch (error) {
      // Corrupt or unreadable copy. Starting fresh is still the right
      // recovery, but it is not silent any more: a wallet that "forgets" its
      // cipher after this branch used to be indistinguishable from a wrong
      // secret, and the user got blamed for it.
      this.storageError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('[store] saved state unreadable, starting from defaults:', this.storageError);
    }
    const base = parsed ? this.merge(parsed) : emptyState();

    // Wallet secrets round-trip through localStorage (see WalletSecrets
    // comment above) — pull whatever the persistence layer has. Memory
    // is only a fast-read mirror; on a fresh tab it's empty and the
    // disk copy is the only source of truth, so the second branch
    // (load from disk) is the one that actually carries the user
    // across a refresh. The first branch is hit on the rare same-tab
    // call to load() where something else already populated memory.
    if (memoryWalletSecrets?.pinEncryptedMnemonic) {
      base.wallet.pinEncryptedMnemonic = memoryWalletSecrets.pinEncryptedMnemonic;
      base.wallet.pinHash = memoryWalletSecrets.pinHash;
    } else if (parsed?.wallet?.pinEncryptedMnemonic) {
      // Fresh-tab load — rehydrate the in-memory mirror from disk.
      memoryWalletSecrets = {
        pinEncryptedMnemonic: parsed.wallet.pinEncryptedMnemonic,
        pinHash: parsed.wallet.pinHash || '',
      };
      base.wallet.pinEncryptedMnemonic = parsed.wallet.pinEncryptedMnemonic;
      base.wallet.pinHash = parsed.wallet.pinHash || '';
    }

    // Task 4.8: Sync auth state with the session marker on initial load.
    // The JWT itself lives in an httpOnly cookie this code can't read — this
    // is just a same-origin hint (services/auth.ts's non-secret
    // `{authedUntil}` marker, SESSION_KEY = 'session') so the UI doesn't
    // flash "logged out" before App.tsx's GET /api/auth/me hydration call
    // resolves — that call is the actual source of truth and will correct
    // this if it's wrong. Reads the marker directly rather than importing
    // authService: auth.ts imports `store` from this file, so a top-level
    // import the other way would be circular, and this constructor runs
    // as part of module evaluation, before a circularly-imported auth.ts's
    // own exports would be initialized.
    try {
      const raw = localStorage.getItem('session');
      const authedUntil = raw ? (JSON.parse(raw) as { authedUntil?: number }).authedUntil : undefined;
      base.user.authed = typeof authedUntil === 'number' && authedUntil > Math.floor(Date.now() / 1000);
    } catch {
      base.user.authed = false;
    }

    this.persistMainStore(base);
    this.writeWalletSecrets(base.wallet.pinEncryptedMnemonic, base.wallet.pinHash);
    return base;
  }

  private merge(saved: AppState): AppState {
    const base = emptyState();
    const savedCurrency = (saved.prefs as unknown as { currency?: string })?.currency;
    const currency = savedCurrency && /^[A-Z]{3}$/.test(savedCurrency) ? savedCurrency : detectDefaultCurrency();
    const out: AppState = {
      ...base,
      ...saved,
      user: { ...base.user, ...saved.user },
      balances: { ...base.balances, ...saved.balances },
      prefs: { ...base.prefs, ...saved.prefs, currency },
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
      flows: { ...base.flows, ...saved.flows },
    };
    // Careers used to be a seeded local list, and DevHub a local list of API
    // keys. `...saved` would resurrect both for every returning browser, so the
    // old slices are dropped on read: the board and the keys are whatever the
    // server has, and nothing else.
    delete (out as unknown as Record<string, unknown>).careers;
    delete (out as unknown as Record<string, unknown>).devhub;
    return out;
  }

  /** Persist, and report whether the browser actually kept it. */
  persist(): boolean {
    const ok = this.persistMainStore(this.state);
    this.writeWalletSecrets(this.state.wallet.pinEncryptedMnemonic, this.state.wallet.pinHash);
    return ok;
  }

  /**
   * What survives a refresh — read straight off disk, not from the in-memory
   * mirror. `state.wallet` cannot answer that: it holds whatever was just
   * assigned even if the `localStorage.setItem` underneath it failed, which is
   * how a saved-but-never-stored credential came back later as "wrong cipher".
   */
  readPersistedWalletSecrets(): { pinEncryptedMnemonic: string; pinHash: string; secretMode: '' | 'cipher' } | null {
    try {
      const raw = localStorage.getItem(OS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppState;
      const wallet = parsed?.wallet;
      if (!wallet?.pinEncryptedMnemonic) return null;
      return {
        pinEncryptedMnemonic: wallet.pinEncryptedMnemonic,
        pinHash: wallet.pinHash || '',
        secretMode: wallet.secretMode === 'cipher' ? 'cipher' : '',
      };
    } catch {
      return null;
    }
  }

  private writeWalletSecrets(pinEncryptedMnemonic: string, pinHash: string) {
    // Store secrets in memory only (not sessionStorage) to prevent XSS theft
    memoryWalletSecrets = {
      pinEncryptedMnemonic: pinEncryptedMnemonic || '',
      pinHash: pinHash || ''
    };
  }

  private persistMainStore(state: AppState): boolean {
    try {
      const toPersist = { ...state };
      if (toPersist.wallet) {
        // Only strip the legacy plaintext mnemonic field — the
        // PIN-encrypted blob and PIN hash MUST round-trip through
        // localStorage, otherwise the wallet is dead after a refresh
        // (CipherChallengeHost would treat every decrypt failure as a wrong
        // PIN and lock the user out forever).
        const { mnemonic: _m, ...safeWallet } = toPersist.wallet as typeof toPersist.wallet & { mnemonic?: string };
        toPersist.wallet = { ...safeWallet, mnemonic: '' } as typeof toPersist.wallet;
      }
      localStorage.setItem(OS_KEY, JSON.stringify(toPersist));
      this.storageError = null;
      return true;
    } catch (error) {
      // Quota, private mode, or a policy-locked browser. This used to be an
      // empty catch, which is how "saved your cipher" and "nothing was ever
      // written" became the same message on screen.
      this.storageError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('[store] state could not be persisted to localStorage:', this.storageError);
      return false;
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
    notifKind?: NotifKind;
    notifCategory?: NotifCategory;
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
    
    // Raise it on the live feed. `applyTx` is a synchronous store mutation and
    // the feed needs the notifications service, so the reference arrives
    // through the deferred call below — that keeps the api.ts → auth.ts →
    // store.ts cycle out of module initialization (the setTimeout is what this
    // file has always used for that reason, not an arbitrary delay).
    if (opts.notifTitle) {
      this.pushNotification(opts.notifTitle, opts.note || '', opts.notifKind || 'transaction', opts.notifCategory || 'transactions', { txId: tx.id });
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

  /**
   * Raise an event the app just caused, in the user's notification feed.
   *
   * This used to push onto `state.notifications`, an array no component ever
   * read: an order placed, a vote cast or a wallet disconnected after three
   * failed verifications was "notified" to a page of localStorage while the
   * bell and the notifications page showed only server rows. Producers were
   * silent successes. It now goes to services/notificationFeed.ts, which both
   * surfaces render, and the feed is what decides whether the row became real
   * on the server or is honestly labelled device-only.
   */
  pushNotification(
    title: string,
    body = '',
    kind: NotifKind = 'system',
    category: NotifCategory = 'security',
    metadata?: Record<string, unknown>,
  ) {
    if (!this.state.user.authed) return;
    // Deferred for the circular-import reason noted in applyTx; the feed's own
    // module never imports the store.
    setTimeout(() => {
      import('../services/notificationFeed')
        .then(({ notificationFeed }) => {
          notificationFeed.pushDevice({ kind, title, body, category, metadata });
        })
        .catch((err: unknown) => {
          console.error('Failed to raise notification:', err);
        });
    }, 0);
  }

  /** Durable-tier wizard/flow progress — see hooks/useWizard.ts. */
  setFlow(key: string, patch: { step?: string; data?: Record<string, unknown> }) {
    const cur = this.state.flows[key] ?? { step: '', data: {}, updatedAt: 0 };
    this.state.flows[key] = {
      step: patch.step ?? cur.step,
      data: patch.data ? { ...cur.data, ...patch.data } : cur.data,
      updatedAt: Date.now(),
    };
    this.commit();
  }

  getFlow(key: string) {
    return this.state.flows[key];
  }

  clearFlow(key: string) {
    delete this.state.flows[key];
    this.commit();
  }

  /**
   * Apply a full snapshot already persisted by another tab (via a `storage` event).
   * Unlike every other mutation path this does NOT re-persist — the snapshot is
   * already on disk — it only merges into memory and notifies subscribers.
   * Wallet secrets (pinEncryptedMnemonic, pinHash) now live in localStorage too,
   * so the freshly-merged values are correct; we only fall back to the
   * current memory copy if the incoming snapshot somehow doesn't carry them
   * (defensive — merge() spreads `saved` on top of `base`, so this branch
   * should never fire in practice).
   */
  applyExternalState(newState: AppState) {
    const savedSecrets = {
      pinEncryptedMnemonic: this.state.wallet.pinEncryptedMnemonic,
      pinHash: this.state.wallet.pinHash,
    };
    this.state = this.merge(newState);
    if (!this.state.wallet.pinEncryptedMnemonic && savedSecrets.pinEncryptedMnemonic) {
      this.state.wallet.pinEncryptedMnemonic = savedSecrets.pinEncryptedMnemonic;
      this.state.wallet.pinHash = savedSecrets.pinHash;
    }
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* listener error must not break the store */
      }
    });
  }

  /**
   * Three failed verifications: this device stops holding the wallet.
   *
   * Deliberately destructive, and deliberately not a countdown. The point is
   * that a person who has typed the wrong secret three times — a borrowed
   * laptop, someone off the street with an unlocked phone — cannot keep
   * trying, and cannot leave the key material sitting there for the next
   * attempt. What is NOT lost: the funds live on-chain under the recovery
   * phrase, and the phrase itself lives with the user. Re-connecting through
   * "Connect existing wallet" re-imports it and sets fresh credentials.
   * There is no "forgot cipher" route, because a recovery path for a secret
   * the app never stored would be a backdoor into every wallet it protects.
   */
  disconnectWalletAfterFailedVerifications(): void {
    const w = this.state.wallet;
    w.mnemonic = '';
    w.pinEncryptedMnemonic = '';
    w.pinHash = '';
    w.secretMode = '';
    w.address = '';
    w.accountId = '';
    w.linkedOnServer = false;
    memoryWalletSecrets = null;
    // The device-local vault copies are key material too — a failed
    // verification streak must not leave them behind to be pried at later.
    localStorage.removeItem(WALLET_VAULT_STORAGE_KEY);
    this.commit();
    this.pushNotification(
      'Wallet disconnected after 3 failed verifications',
      'Too many incorrect ciphers, so this device dropped the wallet keys. Your funds are safe on-chain. To use the wallet again, reconnect with your 24-word recovery phrase — access resets with fresh credentials.',
      'system',
      'security',
    );
  }

  reset() {
    localStorage.removeItem(OS_KEY);
    // The vault and address book are account-scoped wallet data kept outside
    // OS_KEY, so clearing only the store left a signed-out or newly registered
    // account looking at the previous user's addresses — and the cipher wall
    // offering to decrypt their mnemonic.
    localStorage.removeItem(WALLET_VAULT_STORAGE_KEY);
    localStorage.removeItem(ADDRESS_BOOK_STORAGE_KEY);
    memoryWalletSecrets = null;  // Clear memory secrets on logout
    this.state = emptyState();
    this.commit();
  }
}

export const store = new Store();
export type { Balance as BalanceShape };
export const balanceKeys: (keyof Balance)[] = ['MALL', 'MLPTS', 'USD_M', 'KES', 'EUR', 'GBP'];