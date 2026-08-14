/**
 * Mallchain Mission Control v14 — demo seeds.
 * Loaded ONLY when config.demoMode === true and the store is empty.
 * When demoMode is false the store initializes empty and every module
 * shows its proper empty state (see feature modules' EmptyState usage).
 */
import { store, type AppState, type Campaign } from '../store/store';
import { config } from '../services/config';

export function seedIfDemo(st: AppState): boolean {
  if (!config.demoMode) return false;
  if (st.mines.campaigns.length > 0) return false; // already seeded
  applySeeds(st);
  store.persist();
  return true;
}

function applySeeds(st: AppState) {
  // ---- identity ----
  st.user = {
    id: 'demo-user',
    authed: true,
    role: 'user',
    name: 'Kevin Otieno',
    email: 'kevin@mallchain.ke',
    phone: '+254 712 345 678',
    avatarInitial: 'K',
    bio: 'Campaign participant & validator. Nairobi, Kenya.',
    frozen: false,
    kycLevel: 2,
  };

  // ---- balances ----
  Object.assign(st.balances, { MALL: 1284.5, MLPTS: 3462, USD_M: 482.15, KES: 0, EUR: 0, GBP: 0 });

  // ---- wallet ----
  st.wallet.address = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

  // ---- transactions ----
  st.txs = [
    { id: 'tx01', type: 'receive', amount: 25, asset: 'MLPTS', status: 'confirmed', to: st.wallet.address, ts: Date.now() - 3600e3, note: 'Instagram Follow Campaign reward' },
    { id: 'tx02', type: 'stake', amount: 500, asset: 'MALL', status: 'confirmed', to: 'validator-pool', ts: Date.now() - 86400e3, note: 'Validator stake deposit' },
    { id: 'tx03', type: 'receive', amount: 0.8, asset: 'MALL', status: 'confirmed', to: st.wallet.address, ts: Date.now() - 86400e3 * 2, note: 'Consensus-matched review reward' },
    { id: 'tx04', type: 'swap', amount: 120, asset: 'MALL', status: 'confirmed', to: 'pool:MALL/USD-M', ts: Date.now() - 86400e3 * 3, note: 'Swapped to USD-M' },
    { id: 'tx05', type: 'send', amount: 40, asset: 'MALL', status: 'confirmed', to: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6', ts: Date.now() - 86400e3 * 4, note: 'Payment to Jua Digital' },
  ];

  // ---- notifications ----
  st.notifications = [
    { id: 'n1', kind: 'mines', title: 'Submission approved', body: '+25 MLPTS · Instagram Follow Campaign', read: false, ts: Date.now() - 3600e3 },
    { id: 'n2', kind: 'validators', title: 'Consensus matched', body: '+0.8 MALL reward for review #88124', read: false, ts: Date.now() - 7200e3 },
    { id: 'n3', kind: 'system', title: 'Welcome to Mission Control', body: 'Explore the OS — wallet, mining, governance and more.', read: true, ts: Date.now() - 86400e3 },
  ];

  // ---- activity ----
  st.activity = [
    { id: 'a1', text: 'Received 25 MLPTS · Instagram Follow Campaign', ts: Date.now() - 3600e3 },
    { id: 'a2', text: 'Matched consensus · review #88124 · +0.8 MALL', ts: Date.now() - 7200e3 },
    { id: 'a3', text: 'Staked 500 MALL as validator', ts: Date.now() - 86400e3 },
  ];

  // ---- marketplace ----
  st.marketplace.cart = [];
  st.marketplace.wishlist = ['prod-2'];
  st.marketplace.orders = [
    { id: 'ord-1001', items: ['Nairobi Roast Coffee — 500g'], total: 32.5, status: 'transit', ts: Date.now() - 86400e3 * 2 },
    { id: 'ord-1002', items: ['Maasai Beaded Bracelet'], total: 14.0, status: 'delivered', ts: Date.now() - 86400e3 * 6 },
  ];

  // ---- staking ----
  st.staking = {
    delegated: 250,
    apy: 12.4,
    pendingUnstake: 0,
    cooldownEnds: null,
    history: [
      { id: 'st1', type: 'delegate', amount: 250, ts: Date.now() - 86400e3 * 12 },
      { id: 'st2', type: 'reward', amount: 2.12, ts: Date.now() - 86400e3 },
    ],
  };

  // ---- governance ----
  st.governance.proposals = [
    { id: '123', title: 'Allocate 2% of treasury to grants', body: 'Fund early-stage creators building on Mallchain with quarterly grants.', options: ['For', 'Against', 'Abstain'], votes: [642, 218, 40], quorum: 800, status: 'active', comments: [{ author: 'Amina W.', text: 'Strongly support — creators are the backbone.', ts: Date.now() - 86400e3 }], createdByMe: false, ts: Date.now() - 86400e3 * 3 },
    { id: '124', title: 'Raise validator minimum stake', body: 'Increase the minimum stake from 500 to 750 MALL to strengthen the trust layer.', options: ['For', 'Against', 'Abstain'], votes: [410, 372, 60], quorum: 800, status: 'active', comments: [], createdByMe: false, ts: Date.now() - 86400e3 * 5 },
    { id: '125', title: 'Community marketing budget Q3', body: 'Approve 1.2% of treasury for community-led marketing in Q3.', options: ['For', 'Against', 'Abstain'], votes: [785, 91, 30], quorum: 800, status: 'active', comments: [], createdByMe: false, ts: Date.now() - 86400e3 * 7 },
  ];

  // ---- mines ----
  st.mines.campaigns = SEED_CAMPAIGNS.map((c) => ({ ...c }));
  st.mines.participations = [
    { id: 'p1', campaign: 'c3', status: 'pending', steps: 5, ts: '14:02', reward: 15 },
    { id: 'p2', campaign: 'c1', status: 'approved', steps: 5, ts: '13:40', reward: 25 },
    { id: 'p3', campaign: 'c6', status: 'inprogress', steps: 2, ts: '12:15', reward: 75 },
    { id: 'p5', campaign: 'c5', status: 'pending', steps: 5, ts: '10:22', reward: 30 },
    { id: 'p7', campaign: 'c8', status: 'rejected', steps: 5, ts: '09:10', reward: 50, appealAvailable: true, rejectReason: 'Duplicate submission' },
  ];
  st.mines.submissions = [
    { id: '#44192', pid: 'p1', campaign: 'c3', wallet: '0x7A9fC2b8…D6f8', ai: 98, human: 12, need: 18, status: 'voting', reason: null, reward: 15, plat: 'Telegram' },
    { id: '#44191', pid: 'p2', campaign: 'c1', wallet: '0x7A9fC2b8…D6f8', ai: 97, human: 18, need: 18, status: 'voting', reason: null, reward: 25, plat: 'Instagram' },
    { id: '#44188', pid: 'p7', campaign: 'c8', wallet: '0x7A9fC2b8…D6f8', ai: 62, human: 18, need: 18, status: 'rejected', reason: 'Duplicate submission', reward: 50, plat: 'Instagram' },
  ];
  st.mines.earnings = [
    { day: 'Mon', v: 125 }, { day: 'Tue', v: 480 }, { day: 'Wed', v: 310 },
    { day: 'Thu', v: 540 }, { day: 'Fri', v: 390 }, { day: 'Sat', v: 720 }, { day: 'Sun', v: 435 },
  ];
  st.mines.hist = [
    { d: 'Yesterday', ev: [
      { ico: '📸', t: 'Instagram Follow Campaign', s: 'Completed → Approved', a: 25, pos: true },
      { ico: '✈️', t: 'Telegram Join', s: 'Rejected — Reason: Duplicate submission', a: 0, pos: false },
      { ico: '🎵', t: 'TikTok Like Campaign', s: 'Completed → Approved', a: 40, pos: true },
    ] },
    { d: 'Aug 1', ev: [
      { ico: '▶️', t: 'YouTube Watch', s: 'Completed → Approved', a: 75, pos: true },
      { ico: '💼', t: 'LinkedIn Follow', s: 'Completed → Approved', a: 35, pos: true },
    ] },
  ];

  // ---- validators ----
  st.validators.application = { name: 'Kevin Otieno', country: 'Kenya', wallet: st.wallet.address, occ: 'Software Engineer', net: '8h/day', hours: 12, exp: 2, ts: new Date().toISOString() };
  st.validators.eligibility = {
    checks: [
      { ok: true, label: 'Verified identity — KYC Level 2' },
      { ok: true, label: 'Wallet age — older than 30 days' },
      { ok: true, label: 'Reputation — above 90' },
      { ok: true, label: 'Minimum stake — 500 MALL available' },
      { ok: true, label: 'No fraud record' },
    ],
    eligible: true,
    ts: new Date().toISOString(),
  };
  st.validators.stakeLocked = 500;
  st.validators.training = { score: 95, passed: true, attempts: 1, ts: new Date().toISOString() };
  st.validators.approval = { start: new Date(Date.now() - 86400e3).toISOString(), ends: new Date(Date.now() + 86400e3 * 3).toISOString(), approved: true };
  st.validators.daily = { reviewed: 34, approved: 29, rejected: 5, matched: 31, incorrect: 3, reward: 24.8 };
  st.validators.reputation = { accuracy: 92, votes: 412, correct: 379, incorrect: 33, fraud: 1, speed: 4.2, trust: 88, rank: 'Gold' };
  st.validators.strikes = 1;
  st.validators.weekly = [
    { w: 'W1', reviewed: 148, approved: 131, matched: 138, reward: 110.4, acc: 94 },
    { w: 'W2', reviewed: 162, approved: 145, matched: 151, reward: 120.8, acc: 93 },
    { w: 'W3', reviewed: 175, approved: 158, matched: 164, reward: 131.2, acc: 92 },
    { w: 'W4', reviewed: 190, approved: 172, matched: 178, reward: 142.4, acc: 91 },
  ];
  st.validators.calculator = {
    mode: 'projection',
    inputs: { reviews: 20, days: 26, acc: 92, penalty: true, strike: true, cons: 85 },
    stake: 500,
    result: { gross: 353.6, net: 353.6, mult: 1, tier: 0, repEnd: 88.7, effective: 100 },
  };
  st.validators.rewardsLeaderboard = { validators: SEED_LEADERBOARD.map((v) => ({ ...v })), ts: Date.now() };

  // ---- explorer ----
  st.explorer.blocks = [
    { h: 1482031, txs: 214, ts: Date.now() - 4e3, hash: '0x9f2c…41ab' },
    { h: 1482030, txs: 198, ts: Date.now() - 9e3, hash: '0x1b7e…90cd' },
    { h: 1482029, txs: 231, ts: Date.now() - 15e3, hash: '0x4d08…c3f2' },
  ];
  st.explorer.txs = [
    { hash: '0xab12…9f01', from: st.wallet.address, to: 'mall1x9ve…dyvvxm6', val: 25, ts: Date.now() - 4e3 },
    { hash: '0xcd34…2b33', from: 'mall1fgfc…zewqa5', to: st.wallet.address, val: 0.8, ts: Date.now() - 9e3 },
  ];

  // ---- messaging ----
  st.messaging.conversations = [
    {
      id: 'conv-1',
      name: 'Nia (Mallchain Support)',
      unread: 2,
      typing: false,
      messages: [
        { from: 'them', text: 'Hi Kevin! Welcome to Mallchain Mission Control 👋', ts: Date.now() - 86400e3 * 2 },
        { from: 'me', text: 'Thanks! The validator dashboard looks great.', ts: Date.now() - 86400e3 * 2 + 60e3 },
        { from: 'them', text: 'Your application was approved. You are live!', ts: Date.now() - 3600e3 },
      ],
    },
    {
      id: 'conv-2',
      name: 'Campaign Creators KE',
      unread: 0,
      typing: false,
      messages: [
        { from: 'them', text: 'New Instagram campaign live — 25 MLPTS.', ts: Date.now() - 86400e3 },
        { from: 'me', text: 'Already participated 🚀', ts: Date.now() - 82000e3 },
      ],
    },
  ];

  // ---- referrals ----
  st.referrals = { code: 'MALL-KEVIN24', earned: 145, count: 7, claimed: 100 };

  // ---- admin ----
  st.admin.flags = {
    maintenance: false,
    tradingFreeze: false,
    hideMarketplace: false,
  };
  st.admin.announcements = [
    { id: 'ann-1', text: 'Validator rewards calculator is live — model your monthly MALL earnings.', ts: Date.now() - 86400e3 },
  ];
}

const SEED_CAMPAIGNS: Campaign[] = [
  { id: 'c1', name: 'Instagram Follow Campaign', creator: 'Orthopharm Limited', reward: 25, platform: 'Instagram', participants: 2314, max: 10000, remaining: 412, diff: 'Easy', eta: '30 seconds', validators: 18, verified: true, desc: 'Follow the official page. Like the latest post. Leave one comment.', conf: 98.7, completion: 96.2, avgApprove: '4m 12s', rpm: 48.3, reputation: 4.8, trust: 92, country: 'KE' },
  { id: 'c2', name: 'TikTok Like Campaign', creator: 'Jua Digital', reward: 40, platform: 'TikTok', participants: 1872, max: 5000, remaining: 93, diff: 'Medium', eta: '45 seconds', validators: 24, verified: true, desc: 'Like the pinned video, follow the creator, and drop a comment with #JuaDigital.', conf: 96.1, completion: 91.4, avgApprove: '6m 05s', rpm: 36.7, reputation: 4.6, trust: 88, country: 'KE' },
  { id: 'c3', name: 'Telegram Join', creator: 'Mallchain Community', reward: 15, platform: 'Telegram', participants: 3410, max: 20000, remaining: 1280, diff: 'Easy', eta: '20 seconds', validators: 12, verified: true, desc: 'Join the official Mallchain News channel and verify membership.', conf: 99.2, completion: 98.1, avgApprove: '2m 48s', rpm: 62.1, reputation: 5.0, trust: 97, country: 'Global' },
  { id: 'c4', name: 'Facebook Share', creator: 'Kijani Farms Ltd', reward: 60, platform: 'Facebook', participants: 956, max: 3000, remaining: 214, diff: 'Hard', eta: '2 minutes', validators: 32, verified: true, desc: 'Share the harvest update post publicly and tag 2 friends.', conf: 93.8, completion: 84.6, avgApprove: '9m 33s', rpm: 22.4, reputation: 4.2, trust: 79, country: 'KE' },
  { id: 'c5', name: 'Twitter/X Repost', creator: 'PesaLink', reward: 30, platform: 'X / Twitter', participants: 2980, max: 10000, remaining: 655, diff: 'Easy', eta: '25 seconds', validators: 15, verified: false, desc: 'Repost the pinned announcement and follow @PesaLinkKE.', conf: 95.4, completion: 92.0, avgApprove: '5m 20s', rpm: 41.9, reputation: 4.5, trust: 84, country: 'Global' },
  { id: 'c6', name: 'YouTube Watch', creator: 'TechTalks Africa', reward: 75, platform: 'YouTube', participants: 1240, max: 8000, remaining: 480, diff: 'Medium', eta: '5 minutes', validators: 40, verified: true, desc: 'Watch the full 3-minute product video, like, and subscribe.', conf: 97.6, completion: 89.3, avgApprove: '8m 02s', rpm: 15.2, reputation: 4.7, trust: 90, country: 'Global' },
  { id: 'c7', name: 'LinkedIn Follow', creator: 'BomaPay', reward: 35, platform: 'LinkedIn', participants: 720, max: 4000, remaining: 510, diff: 'Medium', eta: '40 seconds', validators: 20, verified: false, desc: 'Follow the BomaPay company page and engage with the latest post.', conf: 92.9, completion: 86.8, avgApprove: '7m 44s', rpm: 28.6, reputation: 4.1, trust: 76, country: 'KE' },
  { id: 'c8', name: 'Instagram Story Tag', creator: 'Nairobi Eats', reward: 50, platform: 'Instagram', participants: 1645, max: 6000, remaining: 302, diff: 'Medium', eta: '1 minute', validators: 26, verified: true, desc: 'Post a story tagging @nairoibieats with the campaign sticker.', conf: 96.8, completion: 93.5, avgApprove: '5m 58s', rpm: 33.4, reputation: 4.7, trust: 91, country: 'KE' },
];

const SEED_LEADERBOARD = [
  { name: 'Kevin Otieno', initial: 'K', verified: true, reviewsPerDay: 20, accuracy: 92, strikeTier: 1, multiplier: 1.0, gross: 1414.4, net: 1414.4, change: 4.2, mine: true },
  { name: 'Amina Wanjiru', initial: 'A', verified: true, reviewsPerDay: 50, accuracy: 97, strikeTier: 0, multiplier: 1.0, gross: 3536.0, net: 3536.0, change: 8.1, mine: false },
  { name: 'Brian Mwangi', initial: 'B', verified: true, reviewsPerDay: 40, accuracy: 94, strikeTier: 0, multiplier: 1.0, gross: 2828.8, net: 2828.8, change: 2.4, mine: false },
  { name: 'Grace Achieng', initial: 'G', verified: true, reviewsPerDay: 30, accuracy: 90, strikeTier: 2, multiplier: 0.5, gross: 2121.6, net: 1060.8, change: -1.8, mine: false },
  { name: 'Samuel Kipchoge', initial: 'S', verified: true, reviewsPerDay: 25, accuracy: 88, strikeTier: 1, multiplier: 1.0, gross: 1768.0, net: 1768.0, change: 1.2, mine: false },
  { name: 'Faith Njeri', initial: 'F', verified: true, reviewsPerDay: 60, accuracy: 95, strikeTier: 0, multiplier: 1.0, gross: 4243.2, net: 4243.2, change: 5.6, mine: false },
  { name: 'David Omondi', initial: 'D', verified: false, reviewsPerDay: 15, accuracy: 81, strikeTier: 3, multiplier: 0.5, gross: 1060.8, net: 530.4, change: -6.4, mine: false },
  { name: 'Lucy Kamau', initial: 'L', verified: true, reviewsPerDay: 45, accuracy: 96, strikeTier: 0, multiplier: 1.0, gross: 3182.4, net: 3182.4, change: 3.8, mine: false },
  { name: 'Peter Njoroge', initial: 'P', verified: true, reviewsPerDay: 22, accuracy: 85, strikeTier: 2, multiplier: 0.5, gross: 1555.8, net: 777.9, change: -2.2, mine: false },
  { name: 'Mary Wambui', initial: 'M', verified: true, reviewsPerDay: 35, accuracy: 93, strikeTier: 0, multiplier: 1.0, gross: 2475.2, net: 2475.2, change: 2.9, mine: false },
];