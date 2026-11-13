/**
 * Live probe for the four realtime channels that used to be stubs.
 * Runs against the local backend on :4000 and the local chain — no fixtures.
 *
 * Verifies, in order:
 *   1. subscribe:price   -> price:current carries the on-chain market price
 *   2. subscribe:market  -> market:feed primer holds real ledger/catalog rows
 *   3. subscribe:wallet  -> anon rejected; owner receives a real balance
 *   4. POST /api/marketplace/catalog -> market:event pushed to the room
 *   5. subscribe:blocks  -> block:new from the live chain
 *   6. subscribe:price after a 45s quiet gap -> a current snapshot, not the
 *      one the feed held when the room emptied
 *
 * Run with the stack up and the credentials of an account that has a linked
 * wallet in the environment — this file deliberately holds none:
 *   PROBE_EMAIL=... PROBE_PASSWORD=... node backend/scripts/verify-realtime.js
 * Takes about two minutes (the quiet-gap check waits out the poll interval) and
 * creates then deletes one catalog listing, so run it against localhost.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { io } = require('socket.io-client');
const mongoose = require('mongoose');

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:4000';
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set PROBE_EMAIL and PROBE_PASSWORD for an account with a linked wallet.');
  process.exit(2);
}

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const cookie = (raw || []).map(String).find((c) => c.startsWith('auth_token='));
  if (!cookie) throw new Error('login returned no auth_token cookie');
  return { cookie: cookie.split(';')[0], body };
}

function watch(socket, events, bag) {
  for (const name of events) {
    socket.on(name, (payload) => {
      bag[name].push(payload);
      log(`  ← ${name}`, JSON.stringify(payload).slice(0, 260));
    });
  }
}

async function main() {
  const results = { pass: [], fail: [] };
  const check = (label, ok, detail = '') => {
    (ok ? results.pass : results.fail).push(`${label}${detail ? ` — ${detail}` : ''}`);
    log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const { cookie: authCookie } = await login();
  log('Authenticated via POST /api/auth/login');

  // csurf is cookie-backed (`csurf({ cookie: true })`), so the token is bound
  // to the _csrf cookie the token endpoint sets in the same response. Keeping
  // only auth_token — which is what the first run did — reproduces the 403.
  const csrfRes = await fetch(`${BASE}/api/csrf-token`, { headers: { cookie: authCookie } });
  const csrfCookies = (csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie')])
    .map(String)
    .map((c) => c.split(';')[0]);
  const cookie = [...new Set([authCookie, ...csrfCookies])].join('; ');
  const { csrfToken } = await csrfRes.json().catch(() => ({}));
  check('CSRF token endpoint reachable', !!csrfToken, `HTTP ${csrfRes.status}, cookies: ${csrfCookies.map((c) => c.split('=')[0]).join(',')}`);

  // ---- 1 + 2: public feeds -----------------------------------------------
  const anon = io(BASE, { transports: ['websocket'], forceNew: true });
  const anonBag = { 'price:current': [], 'market:feed': [], 'market:event': [], 'block:new': [], 'wallet:update': [], error: [], system: [] };
  watch(anon, Object.keys(anonBag), anonBag);

  await new Promise((r) => (anon.once('connect', r), setTimeout(r, 4000)));
  anon.emit('subscribe:price');
  anon.emit('subscribe:market');
  anon.emit('subscribe:blocks');
  // Negative case first: a format-valid address that this socket does not own.
  // (The earlier probe used a mixed-case dummy and tripped the format check
  // instead, which proved nothing about the ownership rule.)
  const foreign = `mall1${'a'.repeat(44)}`;
  anon.emit('subscribe:wallet', foreign);
  await sleep(4000);

  const price = anonBag['price:current'][0];
  check('price:current emitted on subscribe:price', !!price);
  check(
    'price:current is the on-chain price, not a stub zero',
    Number(price?.buyPriceKes) > 0 && Number(price?.sellPriceKes) > 0,
    `buy=${price?.buyPriceKes} sell=${price?.sellPriceKes} mid=${price?.midPriceKes} source=${price?.source}`
  );
  check('price:current reports where it came from', price?.source === 'chain' || price?.source === 'configured-default', `source=${price?.source}`);
  check('price:current carries a USD conversion when FX is reachable', price?.usd ? Number(price.usd.midPriceUsd) > 0 : true, JSON.stringify(price?.usd));
  check(
    'market:feed primer is a real array',
    Array.isArray(anonBag['market:feed'][0]),
    `${(anonBag['market:feed'][0] || []).length} event(s)`
  );
  const feed = anonBag['market:feed'][0] || [];
  check(
    'no market:feed row leaks an identity or fiat field',
    feed.every((e) => !('userId' in e) && !('walletAddress' in e) && !('fiatAmount' in e) && !('phone' in e)),
    `${feed.length} row(s) checked`
  );
  const walletErr = anonBag.error.find((e) => /Sign in required/i.test(e?.message || ''));
  check('anon wallet subscription is rejected', !!walletErr, walletErr?.message);
  check('the rejected subscription pushed no balance', anonBag['wallet:update'].length === 0);

  // ---- 3: the owner's wallet room ---------------------------------------
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27020/marketplace');
  const User = require('../src/models/user');
  const decoded = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64').toString());
  const userId = decoded.userId || decoded.id;
  const doc = await User.findById(userId).select('walletAddress');
  const address = User.decryptUserPii(doc).walletAddress;
  check('this account has a linked wallet to subscribe with', /^mall1[a-z0-9]{38,58}$/.test(address || ''), String(address).slice(0, 20));

  const authed = io(BASE, { transports: ['websocket'], forceNew: true, extraHeaders: { cookie } });
  const authedBag = { 'wallet:update': [], error: [] };
  watch(authed, Object.keys(authedBag), authedBag);
  await new Promise((r) => (authed.once('connect', r), setTimeout(r, 4000)));
  authed.emit('subscribe:wallet', address);
  await sleep(6000);

  const w = authedBag['wallet:update'][0];
  check('wallet:update reaches the owner', !!w, JSON.stringify(w || authedBag.error[0] || {}).slice(0, 200));
  // The three keys are the whole contract: hooks/useWalletData.ts maps
  // mlcnsAvailable onto the spendable balance and mlcnsLocked onto the locked
  // one, and must not invent MALL/MLPTS keys that were never on the wire.
  check(
    'wallet:update carries exactly the denominations the client reads',
    !!w?.balances && typeof w.balances.mlcns === 'number'
      && typeof w.balances.mlcnsAvailable === 'number'
      && typeof w.balances.mlcnsLocked === 'number',
    JSON.stringify(w?.balances)
  );
  check(
    'available plus locked reconciles to the full balance',
    !!w && Math.abs((w.balances.mlcnsAvailable + w.balances.mlcnsLocked) - w.balances.mlcns) < 1e-6,
    `${w?.balances?.mlcnsAvailable} + ${w?.balances?.mlcnsLocked} vs ${w?.balances?.mlcns}`
  );
  check('wallet:update timestamp is milliseconds', !!w && Number.isFinite(w.timestamp) && w.timestamp > 1e12, String(w?.timestamp));

  // Signed in, but still not this address's owner.
  authedBag.error.length = 0;
  authed.emit('subscribe:wallet', foreign);
  await sleep(2000);
  const mismatch = authedBag.error.find((e) => /only subscribe to your own/i.test(e?.message || ''));
  check("a signed-in socket can't watch someone else's wallet", !!mismatch, mismatch?.message || JSON.stringify(authedBag.error));
  authed.emit('subscribe:wallet', address);

  // ---- 4: a real listing must push market:event to the room -------------
  const before = anonBag['market:event'].length;
  const title = `RT probe listing ${new Date().toISOString()}`;
  const created = await fetch(`${BASE}/api/marketplace/catalog`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrfToken },
    body: JSON.stringify({ title, description: '', category: 'tech', price: 1.5, quantity: 1, status: 'active' }),
  });
  const createdBody = await created.json().catch(() => ({}));
  check('catalog listing accepted', created.status === 201, `HTTP ${created.status} ${JSON.stringify(createdBody).slice(0, 160)}`);
  await sleep(2500);
  const pushed = anonBag['market:event'].slice(before)[0];
  check('market:event pushed live to the room', !!pushed, JSON.stringify(pushed || {}).slice(0, 200));
  check('the live event is the listing that was just created', pushed?.title === title, `${pushed?.title} vs ${title}`);

  // Clean up: remove the probe listing so the storefront does not keep it.
  if (createdBody?.listing?.id) {
    const del = await fetch(`${BASE}/api/marketplace/catalog/${createdBody.listing.id}`, {
      method: 'DELETE',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });
    log(`cleanup: DELETE listing ${createdBody.listing.id} -> HTTP ${del.status}`);
  }

  // ---- 5: blocks ---------------------------------------------------------
  await sleep(7000);
  check('block:new streams from the live chain', anonBag['block:new'].length > 0, `${anonBag['block:new'].length} block(s) in ~7s`);

  anon.close();
  authed.close();

  // ---- 6: a joiner after a quiet gap must not be served the old snapshot --
  // The feed stops polling an empty room on purpose. What it must not do is
  // hand the last pre-gap snapshot to the next person in and then stay silent
  // because the price has not moved — measured live at an 11-minute-old price
  // being served as if it were now.
  log('waiting out the poll interval with nobody subscribed...');
  await sleep(45000);
  const late = io(BASE, { transports: ['websocket'], forceNew: true });
  const lateBag = { 'price:current': [] };
  watch(late, Object.keys(lateBag), lateBag);
  await new Promise((r) => (late.once('connect', r), setTimeout(r, 4000)));
  const askedAt = Date.now();
  late.emit('subscribe:price');
  await sleep(6000);
  const served = lateBag['price:current'][0];
  const ageMs = served ? askedAt - Date.parse(served.asOf) : Infinity;
  check('a joiner after a quiet gap gets a current price, not the held one', ageMs < 20_000, `served snapshot was ${Math.round(ageMs / 1000)}s old`);
  late.close();
  await mongoose.disconnect();

  log('\n──────── summary ────────');
  log(`PASS ${results.pass.length}  FAIL ${results.fail.length}`);
  for (const f of results.fail) log('  failed: ' + f);
  process.exit(results.fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error('PROBE ERROR:', err.message);
  process.exit(2);
});
