/**
 * READ-ONLY inventory for the proposed wallet/account clearance.
 * Joins MongoDB accounts with on-chain mlcoin wallets and classifies them.
 * Nothing here mutates state.
 */
require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { decryptField } = require('../src/utils/fieldEncryption');

const KEEPERS = new Map([
  ['mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg', 'FOUNDER'],
  ['mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5', 'TEAM'],
  ['mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f', 'ORTOPHARM'],
  ['mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6', 'AFA'],
]);

// Unambiguous machine-generated fixtures (created by our own test runs).
const TEST_RE = [
  /@mallchain\.io$/i, /@example\.com$/i, /@test\.local$/i,
  /^e2e\d+\./i, /^kyc/i, /^trace\d/i, /^mines-\d/i, /^reftest_/i,
  /^brverify/i, /^pinfix-test@/i, /^qoder\.walker\./i, /^cipher\.e2e\./i,
  /^mpart\.probe\./i, /^kyccam/i, /^kycfinal/i,
];

const dec = (v) => { try { return decryptField(v); } catch { return null; } };

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const chain = await fetch('http://127.0.0.1:1317/tmp/marketplace/mlcoin/v1/wallet_balance')
    .then((r) => r.json()).then((d) => d.wallet_balance);
  const mlcn = new Map(chain.map((w) => [w.address, Number(w.balance) / 1e6]));

  const users = await db.collection('users').find({}).toArray();
  const rows = users.map((u) => {
    const email = dec(u.email) || u.email || '(none)';
    const addr = u.walletAddress ? dec(u.walletAddress) : null;
    return {
      id: String(u._id),
      created: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '----------',
      role: u.role || '?',
      email,
      domain: email.includes('@') ? email.split('@')[1] : '(none)',
      addr,
      mlcns: addr ? (mlcn.get(addr) ?? 0) : 0,
      mlpts: u.mlpts_balance ?? 0,
      kyc: u.kycLevel ?? 0,
      kind: KEEPERS.has(addr) ? 'KEEPER' : TEST_RE.some((re) => re.test(email)) ? 'TEST' : 'EXTERNAL',
    };
  });

  const grp = (k) => rows.filter((r) => r.kind === k);
  const fmt = (n) => n.toLocaleString('en-KE', { maximumFractionDigits: 3 });

  console.log('=== SUMMARY ===');
  console.log('on-chain wallets        :', chain.length, '=', fmt([...mlcn.values()].reduce((a, b) => a + b, 0)), 'MLCNS');
  for (const [a, n] of KEEPERS) console.log(`  keeper ${n.padEnd(10)}      : ${fmt(mlcn.get(a) || 0)} MLCNS`);
  const keeperSum = [...KEEPERS].reduce((a, [x]) => a + (mlcn.get(x) || 0), 0);
  const chainSum = [...mlcn.values()].reduce((a, b) => a + b, 0);
  console.log('  NON-keeper total      :', fmt(chainSum - keeperSum), 'MLCNS');
  console.log('accounts                :', rows.length);
  for (const k of ['KEEPER', 'EXTERNAL', 'TEST']) {
    const rs = grp(k);
    console.log(`  ${k.padEnd(9)}: ${String(rs.length).padStart(3)} accounts, ${fmt(rs.reduce((a, r) => a + r.mlcns, 0))} MLCNS, ${rs.reduce((a, r) => a + r.mlpts, 0)} MLPTS`);
  }

  console.log('\n=== EXTERNAL (non-test-looking) ACCOUNTS — the ones I cannot safely classify ===');
  console.log('created    role        mlcns        mlpts kyc  address          email');
  grp('EXTERNAL').sort((a, b) => a.created.localeCompare(b.created)).forEach((r) => {
    console.log([r.created, r.role.padEnd(11), fmt(r.mlcns).padStart(12), String(r.mlpts).padStart(6),
      String(r.kyc), r.addr ? r.addr.slice(0, 14) + '…' : '(no wallet)   ', r.email].join(' '));
  });

  console.log('\n=== TEST-fixture accounts (count + totals only; emails below) ===');
  grp('TEST').sort((a, b) => a.created.localeCompare(b.created)).forEach((r) => {
    console.log([r.created, r.role.padEnd(10), fmt(r.mlcns).padStart(10), String(r.mlpts).padStart(5), r.email].join(' '));
  });

  console.log('\n=== on-chain wallets with NO account pointing at them ===');
  const acct = new Set(rows.map((r) => r.addr).filter(Boolean));
  [...mlcn.entries()].filter(([a]) => !acct.has(a) && !KEEPERS.has(a))
    .sort((a, b) => b[1] - a[1]).forEach(([a, v]) => {
      console.log(`  ${a.slice(0, 20)}… ${fmt(v).padStart(12)} MLCNS`);
    });

  console.log('\n=== money/record collections that reference these accounts ===');
  for (const c of ['kycs', 'kycsubmissions', 'mallpointaccounts', 'mallcoinpurchases', 'mallcoinsales',
    'wallettransactions', 'transactions', 'tasksubmissions', 'campaigns', 'liquiditypoolactivities',
    'liquidityactivities', 'treasuryledgers', 'auditchains', 'anchorregistries', 'notifications',
    'auditlogs', 'badgepurchases', 'messages', 'conversations', 'reports', 'receiveintents',
    'sessions', 'apikeys', 'b2cpayouts', 'pendingpayments', 'validatorapplications', 'amlreviews',
    'compliancelogs', 'loginactivities', 'emailverifications', 'idempotencykeys', 'pinattempts',
    'usersettings', 'notificationpreferences', 'economystates', 'dynamicburnthresholds']) {
    const n = await db.collection(c).countDocuments({});
    if (n) console.log('  ' + c.padEnd(26) + n);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
