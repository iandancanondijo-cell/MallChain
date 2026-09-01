/**
 * Mallchain Cosmos Backend End-to-End Lifecycle Test
 *
 * Exercises the complete 9-step user journey on the Mallchain marketplace:
 *   register → KYC → faucet → buy → convert → stake → send → unstake → sell
 *
 * Supports two execution modes:
 *   (A) TEST_MODE_MOCK=true     — no backend required; axios interceptors
 *                                 fabricate HTTP responses against
 *                                 process.env.BACKEND_URL (default
 *                                 http://127.0.0.1:4000/api).  Useful in
 *                                 CI and for validating the test harness
 *                                 itself without a running chain.
 *   (B) TEST_MODE_MOCK unset    — sends *real* HTTP calls.  Requires the
 *                                 operator to export BACKEND_URL,
 *                                 TEST_USER_EMAIL, TEST_USER_PASSWORD,
 *                                 TEST_WALLET_ADDRESS (mall1… bech32) and
 *                                 TEST_MPESA_PHONE.  Protected endpoints
 *                                 carry an `Authorization: Bearer <jwt>`
 *                                 obtained from /auth/login.
 *
 * Each individual step is bounded by a 10-second timeout, prints a single
 * `✓` line on success with its wall-clock stepDurationMs, and on any
 * failure causes the process to exit with a non-zero status code.  A
 * summary table plus the aggregate "FULL 9-STEP USER LIFECYCLE E2E:
 * PASSED" banner are emitted at the end.
 *
 * Only runtime dependencies that already ship in backend/package.json are
 * used: `axios` for transport and the built-in Node `crypto` module for
 * idempotency-key / signature material when mocking.
 */

const axios = require('axios');
const crypto = require('crypto');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Configuration & environment
// ---------------------------------------------------------------------------

const TEST_MODE_MOCK = process.env.TEST_MODE_MOCK === 'true';
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
const STEP_TIMEOUT_MS = 10 * 1000;

// Values used by both modes.  In MOCK mode we synthesise a deterministic
// fake user so the run is reproducible; in REAL mode the operator must
// supply them via the environment.
const TEST_USER_EMAIL = TEST_MODE_MOCK
  ? `e2e-${crypto.randomBytes(4).toString('hex')}@mallchain.test`
  : (process.env.TEST_USER_EMAIL || '');
const TEST_USER_PASSWORD = TEST_MODE_MOCK
  ? 'E2eP@ssw0rd!' + crypto.randomBytes(2).toString('hex')
  : (process.env.TEST_USER_PASSWORD || '');
const TEST_WALLET_ADDRESS = TEST_MODE_MOCK
  ? 'mall1' + 'a'.repeat(38)
  : (process.env.TEST_WALLET_ADDRESS || '');
const TEST_MPESA_PHONE = TEST_MODE_MOCK
  ? '254700000000'
  : (process.env.TEST_MPESA_PHONE || '');

const REQUIRED_REAL_VARS = [
  'BACKEND_URL',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
  'TEST_WALLET_ADDRESS',
  'TEST_MPESA_PHONE',
];

// ---------------------------------------------------------------------------
// Shared test state — carried across the 9 steps
// ---------------------------------------------------------------------------
const state = {
  jwt: null,            // bearer token, populated after /auth/login
  userId: null,         // opaque user id returned by register
  kycId: null,          // kyc submission reference
  faucetTxHash: null,   // drip on-chain tx reference
  buyQuoteId: null,     // purchase quote id
  buyPaymentId: null,   // M-Pesa STK payment id
  convertTxHash: null,  // mallpoints → mallcoins on-chain ref
  stakeTxHash: null,    // MsgStake broadcast hash
  sendTxHash: null,     // wallet-to-wallet send hash
  unstakeTxHash: null,  // MsgUnstake broadcast hash
  saleId: null,         // sell-side tracking id
  payoutRef: null,      // B2C payout reference
};

const stepResults = [];   // { stepName, stepDurationMs, ok, note? }

// ---------------------------------------------------------------------------
// Mock-mode state: a tiny in-memory "database" keyed by email so register/
// login round-trips are consistent within a single run.  Declared at module
// scope so it is reachable both from setup and from the api() helper.
// ---------------------------------------------------------------------------
let mockUsers = null;
const API_PREFIX = (() => { try { return new URL(BACKEND_URL).pathname.replace(/\/$/, ''); } catch(_) { return ''; } })();

/**
 * Install mock mode.  Simply allocates the shared mock "database".  Real
 * HTTP traffic is short-circuited inside the api() helper below, which
 * calls mockHandle directly instead of going through axios — this avoids
 * axios 1.x interceptor quirks without adding any new dependency (the
 * user forbade pulling in `nock`).
 */
function installMockInterceptors() { mockUsers = new Map(); }

/**
 * Route table for the mock backend.  Mirrors the real REST surface closely
 * enough that the 9-step flow cannot tell the difference without an on-
 * chain balance probe.  Returns `{ status, data }` shaped the same way an
 * HTTP round-trip through axios would.
 */
function mockHandle(method, rel, body, headers) {
  const authHeader =
    (headers && typeof headers.get === 'function') ? headers.get('authorization') :
    (headers && (headers.Authorization || headers.authorization)) ||
    '';
  const bearerMatch = String(authHeader).match(/^Bearer\s+(.+)$/);
  const jwt = bearerMatch ? bearerMatch[1] : null;

  // ---- /auth/register ----------------------------------------------------
  if (method === 'post' && rel === '/auth/register') {
    const id = crypto.randomBytes(8).toString('hex');
    mockUsers.set(body.email, { id, email: body.email, password: body.password, kyc: null });
    const token = 'mock-jwt-' + crypto.randomBytes(16).toString('hex');
    return { status: 201, data: { ok: true, userId: id, token, email: body.email } };
  }

  // ---- /auth/login -------------------------------------------------------
  if (method === 'post' && rel === '/auth/login') {
    const u = mockUsers.get(body.email);
    if (!u || u.password !== body.password) {
      return { status: 401, data: { error: 'invalid credentials' } };
    }
    const token = 'mock-jwt-' + crypto.randomBytes(16).toString('hex');
    return { status: 200, data: { ok: true, token, userId: u.id, email: u.email } };
  }

  // All remaining routes require a bearer token (the same as the real
  // middleware stack enforces).
  if (!jwt) return { status: 401, data: { error: 'authorization required' } };

  // ---- /kyc/submit -------------------------------------------------------
  if (method === 'post' && rel === '/kyc/submit') {
    const kycId = 'kyc_' + crypto.randomBytes(10).toString('hex');
    return {
      status: 200,
      data: { ok: true, kycId, status: 'approved', reviewedAt: new Date().toISOString() },
    };
  }

  // ---- /faucet/drip ------------------------------------------------------
  if (method === 'post' && rel === '/faucet/drip') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        txHash,
        amount: '1000000',  // 1.0 MLCNS in 6-decimal micro-units
        denom: 'umlcn',
        creditedAt: new Date().toISOString(),
      },
    };
  }

  // ---- /buy/initiate (STK push) -----------------------------------------
  if (method === 'post' && rel === '/buy/initiate') {
    const quoteId = 'Q' + crypto.randomBytes(12).toString('hex');
    const paymentId = 'PAY' + crypto.randomBytes(16).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        quoteId,
        paymentId,
        status: 'stk_push_sent',
        amountMlcns: body.amountMlcns || '5000000',
        amountKes: body.amountKes || 500,
        currency: 'KES',
        phone: body.phone,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      },
    };
  }

  // ---- /buy/mpesa/callback ----------------------------------------------
  if (method === 'post' && rel === '/buy/mpesa/callback') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        resultCode: 0,
        resultDesc: 'Success',
        txHash,
        credited: true,
        balanceAfter: '10500000',
      },
    };
  }

  // ---- /convert (mallpoints → mallcoins) --------------------------------
  if (method === 'post' && rel === '/convert') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        txHash,
        pointsConverted: body.points || 1000,
        mlcnsMinted: '1000000',
        conversionRate: '1.000000',
      },
    };
  }

  // ---- /staking/stake ----------------------------------------------------
  if (method === 'post' && rel === '/staking/stake') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        txHash,
        amount: body.amount || '500000',
        validator: body.validator || 'mallvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0qrrh3',
        bondedAt: new Date().toISOString(),
      },
    };
  }

  // ---- /wallet/send ------------------------------------------------------
  if (method === 'post' && rel === '/wallet/send') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        txHash,
        from: body.from || TEST_WALLET_ADDRESS,
        to: body.to || 'mall1' + 'b'.repeat(38),
        amount: body.amount || '100000',
        denom: body.denom || 'umlcn',
      },
    };
  }

  // ---- /staking/unstake --------------------------------------------------
  if (method === 'post' && rel === '/staking/unstake') {
    const txHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        txHash,
        amount: body.amount || '500000',
        validator: body.validator || 'mallvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0qrrh3',
        unbondingCompletionTime: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      },
    };
  }

  // ---- /sell/initiate ----------------------------------------------------
  if (method === 'post' && rel === '/sell/initiate') {
    const saleId = 'SALE' + crypto.randomBytes(12).toString('hex').toUpperCase();
    const payoutRef = 'PAYOUT' + crypto.randomBytes(10).toString('hex').toUpperCase();
    const burnTxHash = crypto.randomBytes(32).toString('hex').toUpperCase();
    return {
      status: 200,
      data: {
        ok: true,
        saleId,
        payoutRef,
        burnTxHash,
        amountBurned: body.amount || '1000000',
        payoutKes: body.expectedPayoutKes || 95,
        phone: body.phone || TEST_MPESA_PHONE,
        payoutStatus: 'initiated',
      },
    };
  }

  // ---- /sell/payout/callback (not a user step but used to confirm sell) --
  if (method === 'post' && rel === '/sell/payout/callback') {
    return {
      status: 200,
      data: {
        ok: true,
        resultCode: 0,
        resultDesc: 'The payout transaction was processed successfully',
        saleId: body.saleId,
        payoutRef: body.payoutRef,
        payoutStatus: 'succeeded',
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

/**
 * Execute a single named step, enforcing the 10-second wall-clock timeout,
 * recording its duration into `stepResults`, and emitting the `✓` line.
 *
 * @param {string} name      human-readable step label (1/9 … 9/9)
 * @param {() => Promise<void>} fn  async body that performs the real work
 *                                  and throws on failure.
 */
async function step(name, fn) {
  const start = Date.now();
  let ok = false;
  let note = '';
  try {
    await withTimeout(fn(), STEP_TIMEOUT_MS, `step "${name}" exceeded ${STEP_TIMEOUT_MS}ms`);
    ok = true;
  } catch (err) {
    note = err && err.message ? err.message : String(err);
    // Surface the failure immediately so the operator doesn't stare at a
    // silent CI log while the aggregate table is being built.
    process.stderr.write(`\n✗ ${name} FAILED: ${note}\n`);
    printSummaryAndExit(1);
  } finally {
    const stepDurationMs = Date.now() - start;
    stepResults.push({ stepName: name, stepDurationMs, ok, note });
    // eslint-disable-next-line no-console
    console.log(`✓ ${name} (stepDurationMs=${stepDurationMs})`);
  }
}

/** Reject a promise if it does not settle within `ms`. */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    promise
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Thin HTTP wrapper.  In MOCK mode the call never leaves the process; we
 * fabricate the response with mockHandle.  In REAL mode we delegate to
 * axios, adding the bearer token and BACKEND_URL base.
 */
function api(method, path, body, { needAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth && state.jwt) headers.Authorization = `Bearer ${state.jwt}`;

  if (TEST_MODE_MOCK) {
    return new Promise((resolve, reject) => {
      const rel = API_PREFIX && path.startsWith(API_PREFIX)
        ? path.slice(API_PREFIX.length)
        : path;
      const m = String(method).toLowerCase();
      const b = body || {};
      let resp = mockHandle(m, rel, b, headers);
      if (!resp) resp = { status: 404, data: { error: `mock: no handler for ${m} ${rel}` } };
      if (resp.status >= 200 && resp.status < 300) {
        resolve(resp.data);
      } else {
        const err = new Error(`mock HTTP ${resp.status}`);
        err.response = { data: resp.data, status: resp.status, headers: {} };
        reject(err);
      }
    });
  }

  return axios({
    method,
    url: BACKEND_URL + path,
    data: body,
    headers,
    timeout: STEP_TIMEOUT_MS,
    validateStatus: s => s >= 200 && s < 300,
  }).then(r => r.data);
}

// ---------------------------------------------------------------------------
// Validation guard for REAL mode
// ---------------------------------------------------------------------------

function validateRealModeEnv() {
  const missing = REQUIRED_REAL_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    process.stderr.write(
      `REAL mode requires the following env vars to be exported:\n  - ` +
      missing.join('\n  - ') + '\nAborting.\n'
    );
    process.exit(2);
  }
  if (!/^mall1[a-z0-9]{38,58}$/.test(TEST_WALLET_ADDRESS)) {
    process.stderr.write(
      `TEST_WALLET_ADDRESS="${TEST_WALLET_ADDRESS}" does not look like a ` +
      `Mallchain bech32 address (mall1… prefix expected).\n`
    );
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// The 9 steps of the user lifecycle — each wrapped in its own JSDoc block
// so operators reading the script can map the HTTP call to the product
// capability it exercises.
// ---------------------------------------------------------------------------

/**
 * Step 1 — Register a new user account.
 *
 * POST /auth/register with an email + password.  The backend creates a
 * user row and (in real mode) issues a short-lived JWT we could use for
 * subsequent calls.  The E2E harness explicitly calls /auth/login next
 * instead of relying on the register-issued token so both endpoints are
 * independently validated.
 */
async function stepRegister() {
  const res = await api('post', '/auth/register', {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  }, { needAuth: false });
  if (!res || !res.userId) throw new Error('register: missing userId in response');
  state.userId = res.userId;
  if (res.token) state.jwt = res.token;
}

/**
 * Step 2 — Submit KYC (Know Your Customer) data.
 *
 * POST /kyc/submit with a representative KYC payload (first/last name,
 * address, idType, etc.).  Real backends may run an asynchronous AML
 * sweep so we only assert that the endpoint accepts the submission and
 * returns a kycId; the mocked path auto-approves to keep the run
 * deterministic.
 */
async function stepKyc() {
  const res = await api('post', '/kyc/submit', {
    firstName: 'Eve',
    lastName: 'Endtoend',
    dateOfBirth: '1990-01-01',
    nationality: 'KE',
    address: '1 Market St',
    city: 'Nairobi',
    country: 'KE',
    postalCode: '00100',
    phoneNumber: TEST_MPESA_PHONE,
    idType: 'national_id',
    idNumber: 'E2E-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    idExpiry: '2035-01-01',
    idDocumentUrl: 's3://mallchain-kyc/e2e-sample.pdf',
    occupation: 'Software Engineer',
    sourceOfFunds: 'salary',
    annualIncome: '500001-1000000',
    politicalExposure: false,
    walletAddress: TEST_WALLET_ADDRESS,
  });
  if (!res || !res.kycId) throw new Error('kyc/submit: missing kycId in response');
  state.kycId = res.kycId;
}

/**
 * Step 3 — Request test tokens from the developer faucet.
 *
 * POST /faucet/drip accredits TEST_WALLET_ADDRESS with a small amount of
 * the gas denomination (umlcn) and returns the on-chain tx hash so the
 * operator can cross-check a block explorer if debugging.  Real
 * deployments rate-limit this endpoint per IP / address; MOCK mode
 * always succeeds.
 */
async function stepFaucet() {
  const res = await api('post', '/faucet/drip', {
    address: TEST_WALLET_ADDRESS,
    denom: 'umlcn',
  });
  if (!res || !res.txHash) throw new Error('faucet/drip: missing txHash');
  state.faucetTxHash = res.txHash;
}

/**
 * Step 4 — Initiate a Mallcoin purchase via the M-Pesa STK push flow.
 *
 * POST /buy/initiate kicks off the fiat-onramp: the backend (a) reserves
 * a quote, (b) sends an STK push to TEST_MPESA_PHONE, and (c) returns a
 * paymentId we can poll.  We then simulate the mobile-money callback by
 * POSTing to /buy/mpesa/callback with a success payload so the backend
 * marks the purchase as confirmed and — in real mode — mints MLCNS into
 * the user's wallet.
 */
async function stepBuy() {
  const init = await api('post', '/buy/initiate', {
    walletAddress: TEST_WALLET_ADDRESS,
    phone: TEST_MPESA_PHONE,
    amountMlcns: '5000000',   // 5.0 MLCNS
    amountKes: 500,
    currency: 'KES',
    idempotencyKey: crypto.randomBytes(16).toString('hex'),
  });
  if (!init || !init.quoteId || !init.paymentId) {
    throw new Error('buy/initiate: quoteId + paymentId required');
  }
  state.buyQuoteId = init.quoteId;
  state.buyPaymentId = init.paymentId;

  const cb = await api('post', '/buy/mpesa/callback', {
    Body: {
      stkCallback: {
        MerchantRequestID: state.buyPaymentId,
        CheckoutRequestID: 'CB-' + state.buyPaymentId,
        ResultCode: 0,
        ResultDesc: 'Success. Request accepted for processing',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 500 },
            { Name: 'MpesaReceiptNumber', Value: 'MCE2E' + crypto.randomBytes(6).toString('hex').toUpperCase() },
            { Name: 'PhoneNumber', Value: Number(TEST_MPESA_PHONE) },
          ],
        },
      },
    },
  });
  if (!cb || cb.resultCode !== 0) {
    throw new Error('buy/mpesa/callback: non-zero resultCode');
  }
}

/**
 * Step 5 — Convert Mallpoints to Mallcoins.
 *
 * POST /convert exercises the ADR-036 signed conversion endpoint.  In
 * MOCK mode signature verification is bypassed; in REAL mode the caller
 * would need to sign a timestamped message with the wallet's private
 * key.  We pass a synthetic (pubKey, signature) pair that the mock
 * interceptor accepts; the real backend will reject them unless the
 * operator plugs in a valid signer — which is the intended failure mode
 * when someone runs this harness against production without adapting it.
 */
async function stepConvert() {
  const ts = new Date().toISOString();
  const res = await api('post', '/convert', {
    address: TEST_WALLET_ADDRESS,
    points: 1000,
    timestamp: ts,
    pubKey: crypto.randomBytes(33).toString('base64'),
    signature: crypto.randomBytes(64).toString('base64'),
  });
  if (!res || !res.txHash) throw new Error('convert: missing txHash');
  state.convertTxHash = res.txHash;
}

/**
 * Step 6 — Stake MLCNS with a validator.
 *
 * POST /staking/stake broadcasts a signed MsgStake to the Cosmos chain.
 * The backend's stakingController validates the message, checks sequence
 * numbers, and relays it to Tendermint mempool.  We assert that a
 * txHash comes back; on-chain inclusion is assumed for E2E purposes
 * (a separate block-listener integration test covers that).
 */
async function stepStake() {
  const res = await api('post', '/staking/stake', {
    delegatorAddress: TEST_WALLET_ADDRESS,
    validatorAddress: 'mallvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0qrrh3',
    amount: '500000',
    denom: 'umlcn',
    pubKey: crypto.randomBytes(33).toString('base64'),
    signature: crypto.randomBytes(64).toString('base64'),
    accountNumber: 1,
    sequence: 0,
  });
  if (!res || !res.txHash) throw new Error('staking/stake: missing txHash');
  state.stakeTxHash = res.txHash;
}

/**
 * Step 7 — Send MLCNS to another wallet.
 *
 * POST /wallet/send is the simple p2p transfer endpoint.  It exercises
 * the same MsgSend build + broadcast code path as the frontend wallet
 * screen and validates the bech32 recipient format on the backend.
 */
async function stepSend() {
  const res = await api('post', '/wallet/send', {
    from: TEST_WALLET_ADDRESS,
    to: 'mall1' + 'b'.repeat(38),
    amount: '100000',
    denom: 'umlcn',
    pubKey: crypto.randomBytes(33).toString('base64'),
    signature: crypto.randomBytes(64).toString('base64'),
    accountNumber: 1,
    sequence: 1,
    memo: 'e2e lifecycle transfer',
  });
  if (!res || !res.txHash) throw new Error('wallet/send: missing txHash');
  state.sendTxHash = res.txHash;
}

/**
 * Step 8 — Unstake the previously bonded MLCNS.
 *
 * POST /staking/unstake broadcasts MsgBeginUnbonding and returns an
 * `unbondingCompletionTime` (21 days by default on Cosmos Hub-style
 * chains).  The E2E test only checks endpoint responsiveness; the
 * unbonding period itself is covered by a dedicated chain simulation.
 */
async function stepUnstake() {
  const res = await api('post', '/staking/unstake', {
    delegatorAddress: TEST_WALLET_ADDRESS,
    validatorAddress: 'mallvaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0qrrh3',
    amount: '500000',
    denom: 'umlcn',
    pubKey: crypto.randomBytes(33).toString('base64'),
    signature: crypto.randomBytes(64).toString('base64'),
    accountNumber: 1,
    sequence: 2,
  });
  if (!res || !res.txHash) throw new Error('staking/unstake: missing txHash');
  state.unstakeTxHash = res.txHash;
}

/**
 * Step 9 — Sell MLCNS back to fiat via the B2C payout flow.
 *
 * POST /sell/initiate burns the requested MLCNS amount, calculates the
 * KES payout using the current on-chain market price, and starts a B2C
 * M-Pesa disbursement to TEST_MPESA_PHONE.  We then fabricate the
 * payout-webhook callback to /sell/payout/callback the same way we do
 * for the buy-side STK push, so the final state of the sale is
 * `completed` rather than `pending_payout`.
 */
async function stepSell() {
  const init = await api('post', '/sell/initiate', {
    sellerAddress: TEST_WALLET_ADDRESS,
    amount: '1000000',
    denom: 'umlcn',
    phone: TEST_MPESA_PHONE,
    expectedPayoutKes: 95,
    pubKey: crypto.randomBytes(33).toString('base64'),
    signature: crypto.randomBytes(64).toString('base64'),
    accountNumber: 1,
    sequence: 3,
    idempotencyKey: crypto.randomBytes(16).toString('hex'),
  });
  if (!init || !init.saleId || !init.payoutRef) {
    throw new Error('sell/initiate: saleId + payoutRef required');
  }
  state.saleId = init.saleId;
  state.payoutRef = init.payoutRef;

  const cb = await api('post', '/sell/payout/callback', {
    saleId: state.saleId,
    payoutRef: state.payoutRef,
    resultCode: 0,
    resultDesc: 'The payout transaction was processed successfully',
    transactionId: 'MCE2EPAY' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    transactionAmount: 95,
    receiverPartyPublicName: 'Eve Endtoend-' + TEST_MPESA_PHONE.slice(-4),
  });
  if (!cb || cb.payoutStatus !== 'succeeded') {
    throw new Error('sell/payout/callback: payout not succeeded');
  }
}

// ---------------------------------------------------------------------------
// Summary output & entrypoint
// ---------------------------------------------------------------------------

function printSummaryAndExit(exitCode) {
  // Build a simple ASCII table.  The user explicitly asked for an
  // aggregate "output table" at the end; we avoid pulling in cli-table or
  // similar by hand-rolling one with padEnd.
  const namePad = Math.max(30, ...stepResults.map(s => s.stepName.length));
  const durPad = 14;
  const statusPad = 8;
  const totalDurationMs = stepResults.reduce((a, s) => a + s.stepDurationMs, 0);

  // eslint-disable-next-line no-console
  console.log('\n' + '='.repeat(namePad + durPad + statusPad + 10));
  // eslint-disable-next-line no-console
  console.log(
    '  ' + 'STEP'.padEnd(namePad) +
    '  ' + 'DURATION (ms)'.padStart(durPad) +
    '  ' + 'STATUS'.padEnd(statusPad)
  );
  // eslint-disable-next-line no-console
  console.log('-'.repeat(namePad + durPad + statusPad + 10));
  for (const r of stepResults) {
    // eslint-disable-next-line no-console
    console.log(
      '  ' + r.stepName.padEnd(namePad) +
      '  ' + String(r.stepDurationMs).padStart(durPad) +
      '  ' + (r.ok ? 'PASS' : 'FAIL').padEnd(statusPad)
    );
  }
  // eslint-disable-next-line no-console
  console.log('-'.repeat(namePad + durPad + statusPad + 10));
  // eslint-disable-next-line no-console
  console.log(
    '  ' + 'TOTAL'.padEnd(namePad) +
    '  ' + String(totalDurationMs).padStart(durPad) +
    '  ' + (exitCode === 0 ? 'PASS' : 'FAIL').padEnd(statusPad)
  );
  // eslint-disable-next-line no-console
  console.log('='.repeat(namePad + durPad + statusPad + 10));

  if (exitCode === 0) {
    // eslint-disable-next-line no-console
    console.log('\nFULL 9-STEP USER LIFECYCLE E2E: PASSED');
  } else {
    process.stderr.write('\nFULL 9-STEP USER LIFECYCLE E2E: FAILED\n');
  }

  process.exit(exitCode);
}

// Small shim: /auth/login is not part of the 9 "product" steps but is the
// prerequisite for everything after registration.  We still time it so
// operators can spot slow DB lookups, but we tuck it into the header
// instead of the 9-step table.
async function loginPrerequisite() {
  const start = Date.now();
  const res = await api('post', '/auth/login', {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  }, { needAuth: false });
  if (!res || !res.token) throw new Error('login: no token returned');
  state.jwt = res.token;
  // eslint-disable-next-line no-console
  console.log(`· pre login ok (${Date.now() - start}ms)`);
}

;(async function main() {
  // eslint-disable-next-line no-console
  console.log(`Mallchain E2E lifecycle — mode=${TEST_MODE_MOCK ? 'MOCK' : 'REAL'} backend=${BACKEND_URL}`);

  if (TEST_MODE_MOCK) {
    installMockInterceptors();
  } else {
    validateRealModeEnv();
  }

  try {
    await step('1/9 Register account',      stepRegister);
    await loginPrerequisite();
    await step('2/9 Submit KYC',            stepKyc);
    await step('3/9 Faucet drip',           stepFaucet);
    await step('4/9 Buy MLCNS (STK+cb)',    stepBuy);
    await step('5/9 Convert points→MLCNS',  stepConvert);
    await step('6/9 Stake MLCNS',           stepStake);
    await step('7/9 Wallet send',           stepSend);
    await step('8/9 Unstake MLCNS',         stepUnstake);
    await step('9/9 Sell MLCNS (payout)',   stepSell);
  } catch (e) {
    // Safety net — step() should already have called printSummaryAndExit
    // on first failure, but if something throws *outside* a step we still
    // want non-zero exit + diagnostics.
    process.stderr.write(`unhandled harness error: ${e && e.stack ? e.stack : e}\n`);
    printSummaryAndExit(99);
  }

  printSummaryAndExit(0);
})();
