#!/usr/bin/env node
/**
 * Mallchain Integration Tests
 * Tests the integration between backend API and blockchain node
 *
 * Usage: node tests/integration-test.js
 * Requires: Backend running on port 4000, Blockchain node on ports 26657/1317
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000';
const CHAIN_RPC = 'http://localhost:26657';
const CHAIN_REST = 'http://localhost:1317';

let testUser = {
  email: `test+${Date.now()}@mallchain.local`,
  password: 'Test123!@#',
  name: 'Integration Test User'
};
let authCookie = null;

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(test, status, details = '') {
  const icon = status === 'PASS' ? '✓' : '✗';
  const color = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${test}${details ? ` - ${details}` : ''}`);

  results.tests.push({ test, status, details });
  if (status === 'PASS') results.passed++;
  else results.failed++;
}

async function test(name, fn) {
  try {
    await fn();
    log(name, 'PASS');
  } catch (err) {
    log(name, 'FAIL', err.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Authentication helpers
async function registerUser() {
  const res = await axios.post(`${API_BASE}/api/auth/register`, {
    email: testUser.email,
    password: testUser.password,
    name: testUser.name
  });
  return res.data;
}

async function loginUser() {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    email: testUser.email,
    password: testUser.password
  }, {
    // Capture cookies
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
  });

  // Extract auth cookie
  const cookies = res.headers['set-cookie'];
  if (cookies) {
    authCookie = cookies.find(c => c.startsWith('auth_token='));
  }
  return res.data;
}

function authHeaders() {
  return authCookie ? { Cookie: authCookie } : {};
}

// Test suites
async function testBlockchainConnectivity() {
  console.log('\n=== Blockchain Connectivity ===');

  await test('Blockchain node RPC responding', async () => {
    const res = await axios.get(`${CHAIN_RPC}/status`, { timeout: 5000 });
    assert(res.data.jsonrpc === '2.0', 'Invalid RPC response');
    assert(res.data.result.node_info.network === 'mallchain-1', 'Wrong chain ID');
  });

  await test('Blockchain node REST responding', async () => {
    const res = await axios.get(`${CHAIN_REST}/cosmos/base/tendermint/v1beta1/node_info`, { timeout: 5000 });
    assert(res.data.default_node_info.network === 'mallchain-1', 'Wrong chain ID');
  });

  await test('Blockchain producing blocks', async () => {
    const res = await axios.get(`${CHAIN_RPC}/status`, { timeout: 5000 });
    const height = parseInt(res.data.result.sync_info.latest_block_height);
    assert(height > 0, 'Block height is 0');
  });
}

async function testBackendHealth() {
  console.log('\n=== Backend Health ===');

  await test('Backend API responding', async () => {
    const res = await axios.get(`${API_BASE}/api/health`, { timeout: 5000 });
    assert(res.status === 200, 'Health check failed');
  });

  await test('MongoDB connected', async () => {
    const res = await axios.get(`${API_BASE}/api/health`);
    assert(res.data.database?.status === 'ok', 'MongoDB not connected');
  });

  await test('Redis connected', async () => {
    const res = await axios.get(`${API_BASE}/api/health`);
    assert(res.data.redis?.status === 'ok', 'Redis not connected');
  });
}

async function testAuthentication() {
  console.log('\n=== Authentication ===');

  await test('User registration', async () => {
    const data = await registerUser();
    assert(data.user, 'No user returned');
    assert(data.user.email === testUser.email, 'Email mismatch');
  });

  await test('User login', async () => {
    const data = await loginUser();
    assert(data.user, 'No user returned');
    assert(data.expiresAt, 'No expiration');
    assert(authCookie, 'No auth cookie set');
  });

  await test('Authenticated request with cookie', async () => {
    const res = await axios.get(`${API_BASE}/api/wallet/balance`, {
      headers: authHeaders()
    });
    assert(res.status === 200, 'Request failed');
    assert(res.data.address, 'No address in response');
  });
}

async function testBlockchainTxEndpoints() {
  console.log('\n=== Blockchain Transaction Endpoints ===');

  await test('GET /api/blockchain/tx/all returns transactions', async () => {
    const res = await axios.get(`${API_BASE}/api/blockchain/tx/all?limit=5`);
    assert(res.data.transactions, 'No transactions array');
    assert(Array.isArray(res.data.transactions), 'Transactions not an array');
    assert(res.data.pagination, 'No pagination');
  });

  await test('GET /api/blockchain/tx/address/txs returns address transactions', async () => {
    const address = 'mall1msa4wcpvw20x4x60faywnfqws0v95plq6nsyp0';
    const res = await axios.get(`${API_BASE}/api/blockchain/tx/address/txs?address=${address}&limit=5`);
    assert(res.data.address === address, 'Address mismatch');
    assert(Array.isArray(res.data.transactions), 'Transactions not an array');
    assert(res.data.transactions.length > 0, 'Expected at least 1 transaction');
    assert(res.data.pagination.total > 0, 'Expected total > 0');
  });

  await test('Address tx endpoint extracts transfer events', async () => {
    const address = 'mall1msa4wcpvw20x4x60faywnfqws0v95plq6nsyp0';
    const res = await axios.get(`${API_BASE}/api/blockchain/tx/address/txs?address=${address}&limit=1`);
    const tx = res.data.transactions[0];
    assert(tx.txHash, 'No txHash');
    assert(tx.height > 0, 'Invalid height');
    assert(Array.isArray(tx.transfers), 'No transfers array');
  });

  await test('GET /api/blockchain/stats returns chain info', async () => {
    const res = await axios.get(`${API_BASE}/api/blockchain/stats`);
    assert(res.data.chainId === 'mallchain-1', 'Wrong chain');
    assert(res.data.height > 0, 'Invalid height');
  });
}

async function testEconomyEndpoints() {
  console.log('\n=== Economy Endpoints ===');

  await test('GET /api/economy/state returns market data', async () => {
    const res = await axios.get(`${API_BASE}/api/economy/state`);
    assert(res.data.success, 'Request not successful');
    assert(res.data.market, 'No market data');
    assert(res.data.market.buyPriceKes, 'No buy price');
    assert(res.data.market.sellPriceKes, 'No sell price');
  });

  await test('GET /api/economy/chain-state returns chain economics', async () => {
    const res = await axios.get(`${API_BASE}/api/economy/chain-state`);
    assert(res.data.success, 'Request not successful');
  });
}

async function testStakingEndpoints() {
  console.log('\n=== Staking Endpoints ===');

  await test('GET /api/staking/summary returns staking data', async () => {
    const address = 'mall1msa4wcpvw20x4x60faywnfqws0v95plq6nsyp0';
    const res = await axios.get(`${API_BASE}/api/staking/summary/${address}`);
    assert(res.data.success, 'Request not successful');
    assert(res.data.summary, 'No summary');
    assert(res.data.summary.address === address, 'Address mismatch');
  });
}

async function testValidatorsEndpoints() {
  console.log('\n=== Validators Endpoints ===');

  await test('GET /api/validators/list returns validators', async () => {
    const res = await axios.get(`${API_BASE}/api/validators/list`);
    assert(res.data.success, 'Request not successful');
    assert(Array.isArray(res.data.validators), 'Validators not an array');
  });
}

async function testGovernanceEndpoints() {
  console.log('\n=== Governance Endpoints ===');

  await test('GET /api/governance/proposals returns proposals', async () => {
    const res = await axios.get(`${API_BASE}/api/governance/proposals`);
    assert(res.data.success, 'Request not successful');
    assert(Array.isArray(res.data.proposals), 'Proposals not an array');
  });
}

async function testWalletEndpoints() {
  console.log('\n=== Wallet Endpoints ===');

  await test('GET /api/wallet/balance returns balance', async () => {
    const res = await axios.get(`${API_BASE}/api/wallet/balance`, {
      headers: authHeaders()
    });
    assert(res.status === 200, 'Request failed');
    assert(res.data.address, 'No address');
    assert(typeof res.data.MALL === 'number', 'No MALL balance');
  });
}

async function testExplorerEndpoints() {
  console.log('\n=== Explorer Endpoints ===');

  await test('GET /api/explorer/blocks returns block data', async () => {
    const res = await axios.get(`${API_BASE}/api/explorer/blocks`);
    assert(Array.isArray(res.data.blocks), 'No blocks array');
    assert(res.data.blocks.length > 0, 'No blocks returned');
    assert(res.data.blocks[0].height > 0, 'Invalid block height');
  });
}

// Main test runner
async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Mallchain Integration Test Suite                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`API Base: ${API_BASE}`);
  console.log(`Chain RPC: ${CHAIN_RPC}`);

  try {
    // Run test suites
    await testBlockchainConnectivity();
    await testBackendHealth();
    await testAuthentication();
    await testBlockchainTxEndpoints();
    await testEconomyEndpoints();
    await testStakingEndpoints();
    await testValidatorsEndpoints();
    await testGovernanceEndpoints();
    await testWalletEndpoints();
    await testExplorerEndpoints();

  } catch (err) {
    console.error('\n❌ Test suite error:', err.message);
  }

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total:  ${results.passed + results.failed}`);
  console.log(`\x1b[32mPassed: ${results.passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${results.failed}\x1b[0m`);
  console.log('═'.repeat(60));

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => console.log(`  ✗ ${t.test}: ${t.details}`));
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

runTests();
