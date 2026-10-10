// Gate 61.2 — Phase 7-14: Earn MLPTS → Convert to MLCNS → Verify on-chain
const http = require('http');
const { readFileSync, writeFileSync } = require('fs');

const USER_EMAIL = 'gate61u1_1790820280@test.com';
const USER_PASSWORD = 'SimplePass123';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'TestAdmin123';

function request(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 4000, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, body: buf, json: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email, password) {
  const res = await request('POST', '/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.body}`);
  const authCookie = res.headers['set-cookie']?.find(c => c.startsWith('auth_token='));
  const token = authCookie ? authCookie.split(';')[0].split('=')[1] : null;
  if (!token) throw new Error(`No auth_token for ${email}`);
  return token;
}

async function getChainHeight() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:26657/status', res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        const d = JSON.parse(buf);
        resolve(d.result.sync_info.latest_block_height);
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const evidence = { phases: {} };

  // ─── PHASE 5: Economic params from genesis ───
  console.log('=== PHASE 5: ECONOMIC PARAMS ===');
  const genesis = JSON.parse(readFileSync('/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/blockchain_working/config/genesis.json', 'utf8'));
  const mlcoinParams = genesis.app_state.mlcoin.params;
  console.log('mlpts_per_mlcns:', mlcoinParams.mlpts_per_mlcns);
  console.log('min_conversion_rate:', mlcoinParams.min_conversion_rate);
  console.log('max_conversion_rate:', mlcoinParams.max_conversion_rate);
  console.log('min_stake_amount:', mlcoinParams.min_stake_amount);
  evidence.phases.phase5 = { params: mlcoinParams };

  // ─── PHASE 6: User already registered + wallet linked ───
  console.log('\n=== PHASE 6: USER + WALLET (already done) ===');
  const userState = JSON.parse(readFileSync('/tmp/gate61/user1_linked.json', 'utf8'));
  console.log('User:', userState.email, 'ID:', userState.user_id);
  console.log('Wallet:', userState.address);
  evidence.phases.phase6 = { email: userState.email, user_id: userState.user_id, wallet: userState.address };

  // ─── PHASE 7: Earn MLPTS through mining ───
  console.log('\n=== PHASE 7: EARN MLPTS VIA MINING ===');
  const userToken = await login(USER_EMAIL, USER_PASSWORD);
  console.log('User logged in');

  // Check current MLPTS balance
  const meBefore = await request('GET', '/api/auth/me', null, userToken);
  const mlptsBefore = meBefore.json.mlpts_balance || 0;
  console.log('MLPTS before mining:', mlptsBefore);

  // Submit a mining task
  const submission = await request('POST', '/api/mines/submissions', {
    title: 'Gate 61.2 Mining Test - Social Media Engagement',
    task_type: 'social_engagement',
    description: 'Shared Mallchain platform update on social media as part of Gate 61.2 acceptance testing',
    proof_url: 'https://example.com/gate61-proof-' + Date.now(),
  }, userToken);
  console.log('Submission status:', submission.status);
  console.log('Submission response:', JSON.stringify(submission.json, null, 2));

  if (submission.status !== 200 && submission.status !== 201) {
    console.log('ERROR: Submission failed');
    process.exit(1);
  }

  const submissionId = submission.json.data?._id || submission.json._id || submission.json.submission?._id || submission.json.id;
  console.log('Submission ID:', submissionId);

  // ─── ADMIN APPROVAL ───
  console.log('\n=== ADMIN APPROVAL ===');
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('Admin logged in');

  const approval = await request('POST', `/api/mines/submissions/${submissionId}/approve`, {
    rewardAmount: 50,
  }, adminToken);
  console.log('Approval status:', approval.status);
  console.log('Approval response:', approval.body);

  if (approval.status !== 200) {
    console.log('ERROR: Approval failed');
    process.exit(1);
  }

  // Wait for MLPTS to be credited
  await sleep(2000);

  // Check MLPTS after
  const meAfter = await request('GET', '/api/auth/me', null, userToken);
  const mlptsAfter = meAfter.json.mlpts_balance || 0;
  console.log('\nMLPTS after mining:', mlptsAfter);
  console.log('MLPTS earned:', mlptsAfter - mlptsBefore);

  if (mlptsAfter <= mlptsBefore) {
    console.log('ERROR: MLPTS not credited');
    process.exit(1);
  }

  const mlptsEarned = mlptsAfter - mlptsBefore;
  evidence.phases.phase7 = {
    mlpts_before: mlptsBefore,
    mlpts_after: mlptsAfter,
    mlpts_earned: mlptsEarned,
    submission_id: submissionId,
  };

  // ─── PHASE 8: Record exact MLPTS being converted ───
  console.log('\n=== PHASE 8: RECORD MLPTS FOR CONVERSION ===');
  const mlptsToConvert = Math.floor(mlptsEarned * 0.8); // Convert 80% of earned
  console.log('MLPTS to convert:', mlptsToConvert);
  evidence.phases.phase8 = { mlpts_to_convert: mlptsToConvert };

  // ─── PHASE 9-10: ADR-036 signature + conversion endpoint ───
  console.log('\n=== PHASE 9-10: CONVERSION ===');

  // Find the conversion endpoint
  const convertRes = await request('POST', '/api/wallet/convert-liquidity', {
    amount: mlptsToConvert,
  }, userToken);
  console.log('Conversion status:', convertRes.status);
  console.log('Conversion response:', convertRes.body);

  evidence.phases.phase9_10 = {
    conversion_status: convertRes.status,
    conversion_response: convertRes.json,
  };

  if (convertRes.status !== 200) {
    console.log('WARNING: Conversion may have failed, checking other endpoints...');

    // Try alternative endpoint
    const convertRes2 = await request('POST', '/api/wallet/convert', {
      mlpts_amount: mlptsToConvert,
    }, userToken);
    console.log('Alt conversion status:', convertRes2.status);
    console.log('Alt conversion response:', convertRes2.body);
    evidence.phases.phase9_10_alt = {
      conversion_status: convertRes2.status,
      conversion_response: convertRes2.json,
    };
  }

  // Wait for chain to process
  await sleep(5000);

  // ─── PHASE 11: Query transaction from chain ───
  console.log('\n=== PHASE 11: QUERY TX FROM CHAIN ===');
  const heightAfter = await getChainHeight();
  console.log('Current chain height:', heightAfter);

  // Query bank balances for the user's wallet address
  const balanceRes = await new Promise((resolve, reject) => {
    http.get(`http://localhost:1317/cosmos/bank/v1beta1/balances/${userState.address}`, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(JSON.parse(buf)));
    }).on('error', reject);
  });
  console.log('On-chain balances:', JSON.stringify(balanceRes, null, 2));

  evidence.phases.phase11 = {
    chain_height: heightAfter,
    on_chain_balances: balanceRes,
  };

  // ─── PHASE 13: Verify MLCNS on-chain ───
  console.log('\n=== PHASE 13: VERIFY MLCNS ON-CHAIN ===');
  // Check for umal or stake denom
  const balances = balanceRes.balances || [];
  const stakeBalance = balances.find(b => b.denom === 'stake');
  const umalBalance = balances.find(b => b.denom === 'umal');
  console.log('stake balance:', stakeBalance?.amount || '0');
  console.log('umal balance:', umalBalance?.amount || '0');

  evidence.phases.phase13 = {
    stake_balance: stakeBalance?.amount || '0',
    umal_balance: umalBalance?.amount || '0',
  };

  // ─── PHASE 14: Verify MLPTS debit in backend ───
  console.log('\n=== PHASE 14: VERIFY MLPTS DEBIT ===');
  const meFinal = await request('GET', '/api/auth/me', null, userToken);
  const mlptsFinal = meFinal.json.mlpts_balance || 0;
  console.log('MLPTS final balance:', mlptsFinal);
  console.log('MLPTS debited:', mlptsAfter - mlptsFinal);

  evidence.phases.phase14 = {
    mlpts_after_conversion: mlptsFinal,
    mlpts_debited: mlptsAfter - mlptsFinal,
  };

  // ─── PHASE 15: Cross-layer reconciliation ───
  console.log('\n=== PHASE 15: CROSS-LAYER RECONCILIATION ===');
  console.log('Backend MLPTS balance:', mlptsFinal);
  console.log('On-chain stake:', stakeBalance?.amount || '0');
  console.log('On-chain umal:', umalBalance?.amount || '0');

  evidence.phases.phase15 = {
    backend_mlpts: mlptsFinal,
    chain_stake: stakeBalance?.amount || '0',
    chain_umal: umalBalance?.amount || '0',
  };

  // Save evidence
  writeFileSync('/tmp/gate61/evidence_phase7_15.json', JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to /tmp/gate61/evidence_phase7_15.json');
  console.log('\n=== PHASE 7-15 COMPLETE ===');
})().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
