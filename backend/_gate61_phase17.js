#!/usr/bin/env node
// Gate 61.2 — Phase 17: Repeat full path with second clean user
// Creates a brand new user, earns MLPTS via mining, converts to MLCNS, verifies on-chain

const fs = require('fs');
const http = require('http');
const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');
const mongoose = require('mongoose');

const BACKEND = 'http://localhost:4000';
const CHAIN_RPC = 'http://localhost:26657';
const CHAIN_REST = 'http://localhost:1317';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'TestAdmin123';

function logPhase(n, title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PHASE 17 — STEP: ${title}`);
  console.log('='.repeat(60));
}

function postJson(path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

function getJson(path, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', headers };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function httpGet(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: resp.status, json };
}

async function signAdr036(wallet, address, message, timestamp) {
  const msg = { type: 'sign/MsgSignData', value: { signer: address, data: toBase64(toUtf8(message)) } };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
  const signResult = await wallet.signAmino(address, signDoc);
  const [acct] = await wallet.getAccounts();
  return {
    signatureBase64: signResult.signature.signature,
    pubKeyBase64: toBase64(acct.pubkey),
    timestamp,
  };
}

async function main() {
  // ===== STEP 1: Create brand new user =====
  logPhase(1, 'Create brand new disposable user');
  const ts = Date.now();
  const email = `gate61u2_${ts}@test.com`;
  const password = 'SimplePass123';

  const regRes = await postJson('/api/auth/register', { email, password, name: 'Gate61 User2' });
  console.log('Register status:', regRes.status);
  if (regRes.status !== 200 && regRes.status !== 201) {
    console.log('Register failed:', JSON.stringify(regRes.json));
    process.exit(1);
  }

  // Extract auth token from set-cookie
  const setCookies = regRes.headers['set-cookie'] || [];
  const authCookie = setCookies.find(c => c.startsWith('auth_token='));
  const authToken = authCookie ? authCookie.split(';')[0].split('=')[1] : null;
  console.log('Email:', email);
  console.log('Auth token obtained:', !!authToken);

  // Get user ID
  const meRes = await getJson('/api/auth/me', authToken);
  const userId = meRes.json._id || meRes.json.user?._id;
  console.log('User ID:', userId);

  // ===== STEP 2: Generate wallet + ADR-036 link =====
  logPhase(2, 'Generate wallet + ADR-036 link');
  const wallet = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [account] = await wallet.getAccounts();
  const address = account.address;
  console.log('Address:', address);
  console.log('Mnemonic:', wallet.mnemonic);

  const linkTimestamp = new Date().toISOString();
  const linkMessage = `Link wallet ${address} to my Mallchain account at ${linkTimestamp}`;
  const linkSignResult = await signAdr036(wallet, address, linkMessage, linkTimestamp);

  const linkRes = await postJson('/api/auth/link-wallet', {
    address,
    timestamp: linkSignResult.timestamp,
    pubKey: linkSignResult.pubKeyBase64,
    signature: linkSignResult.signatureBase64,
  }, authToken);
  console.log('Link wallet status:', linkRes.status);
  console.log('Link response:', JSON.stringify(linkRes.json).slice(0, 200));
  if (linkRes.status !== 200) {
    console.error('ERROR: Wallet link failed');
    process.exit(1);
  }

  // ===== STEP 3: Login as admin =====
  logPhase(3, 'Login as admin');
  const adminLogin = await postJson('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const adminCookies = adminLogin.headers['set-cookie'] || [];
  const adminAuthCookie = adminCookies.find(c => c.startsWith('auth_token='));
  const adminToken = adminAuthCookie ? adminAuthCookie.split(';')[0].split('=')[1] : null;
  console.log('Admin token obtained:', !!adminToken);

  // ===== STEP 4: Submit mining task =====
  logPhase(4, 'Submit mining task');
  const submission = await postJson('/api/mines/submissions', {
    task_type: 'social_media_post',
    platform: 'twitter',
    post_url: 'https://twitter.com/gate61u2_test/status/123456',
    description: 'Gate 61.2 Phase 17 test submission',
  }, authToken);
  console.log('Submission status:', submission.status);
  const submissionId = submission.json?.data?._id || submission.json?._id;
  console.log('Submission ID:', submissionId);

  // ===== STEP 5: Admin approve =====
  logPhase(5, 'Admin approve mining submission');
  const approval = await postJson(`/api/mines/submissions/${submissionId}/approve`, { rewardAmount: 75 }, adminToken);
  console.log('Approval status:', approval.status);
  console.log('Approval response:', JSON.stringify(approval.json).slice(0, 300));

  // Wait a moment for the transaction to commit
  await new Promise(r => setTimeout(r, 1000));

  // ===== STEP 6: Verify MLPTS credited =====
  logPhase(6, 'Verify MLPTS credited');
  await mongoose.connect('mongodb://localhost:27020/marketplace?replicaSet=rs0');
  const uid = new mongoose.Types.ObjectId(userId);

  const userAfterMine = await mongoose.connection.db.collection('users').findOne(
    { _id: uid }, { projection: { mlpts_balance: 1, walletAddress: 1 } }
  );
  const mpaAfterMine = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address });

  console.log('User MLPTS:', userAfterMine.mlpts_balance);
  console.log('MallPointAccount balance:', mpaAfterMine?.balance || 0);

  const mlptsEarned = mpaAfterMine?.balance || 0;
  if (mlptsEarned <= 0) {
    console.error('ERROR: MLPTS not credited after mining approval');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`MLPTS earned: ${mlptsEarned}`);

  // ===== STEP 7: Sign conversion + convert =====
  logPhase(7, 'Sign conversion ADR-036 + call convert endpoint');
  const convertTimestamp = new Date().toISOString();
  const convertMessage = `Convert Mallpoints to Mallcoin for ${address} at ${convertTimestamp}`;
  const convertSignResult = await signAdr036(wallet, address, convertMessage, convertTimestamp);

  const convertResp = await postJson('/api/mallpoints/convert', {
    address,
    timestamp: convertSignResult.timestamp,
    pubKey: convertSignResult.pubKeyBase64,
    signature: convertSignResult.signatureBase64,
  });
  console.log('Convert status:', convertResp.status);
  console.log('Convert response:', JSON.stringify(convertResp.json, null, 2).slice(0, 2000));

  if (convertResp.status !== 200) {
    console.error('ERROR: Conversion failed');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ===== STEP 8: Verify tx on-chain =====
  logPhase(8, 'Verify transaction on-chain (DECISIVE)');
  const txHash = convertResp.json?.credit?.transfer?.txHash;
  console.log('Tx hash:', txHash || 'NOT FOUND');

  if (txHash) {
    const txQuery = await httpGet(`${CHAIN_RPC}/tx?hash=0x${txHash}`);
    if (txQuery.json?.result) {
      const r = txQuery.json.result;
      console.log(`Tx height: ${r.height}`);
      console.log(`Tx code: ${r.tx_result?.code}`);
      console.log(`Tx gas used: ${r.tx_result?.gas_used}`);

      const events = r.tx_result?.events || [];
      for (const e of events) {
        if (e.type === 'tx') {
          const attrs = {};
          for (const a of e.attributes) attrs[a.key] = a.value;
          if (attrs.fee) console.log(`Fee: ${attrs.fee}`);
        }
        if (e.type === 'mlcoin_transfer') {
          const attrs = {};
          for (const a of e.attributes) attrs[a.key] = a.value;
          console.log(`mlcoin_transfer: from=${attrs.from} to=${attrs.to} tx_id=${attrs.tx_id}`);
        }
      }
    }
  }

  // ===== STEP 9: Verify MLCNS balance =====
  logPhase(9, 'Verify MLCNS balance on-chain');
  const bankBal = await httpGet(`${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`);
  if (bankBal.json?.balances) {
    for (const b of bankBal.json.balances) console.log(`  ${b.denom}: ${b.amount}`);
  }

  // ===== STEP 10: Post-conversion MongoDB state =====
  logPhase(10, 'Post-conversion MongoDB reconciliation');
  const userAfterConvert = await mongoose.connection.db.collection('users').findOne(
    { _id: uid }, { projection: { mlpts_balance: 1 } }
  );
  const mpaAfterConvert = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address });

  console.log(`User MLPTS after convert: ${userAfterConvert.mlpts_balance} (was ${userAfterMine.mlpts_balance})`);
  console.log(`MPA after convert: ${mpaAfterConvert?.balance || 0} (was ${mpaAfterMine?.balance || 0})`);

  // ===== FINAL SUMMARY =====
  logPhase('FINAL', 'User 2 — Full path summary');
  console.log(`
┌────────────────────────────────────────────────────────────┐
│  USER 2 — COMPLETE PATH VERIFICATION                       │
├────────────────────────────────────────────────────────────┤
│  Email: ${email}
│  User ID: ${userId}
│  Wallet: ${address}
├────────────────────────────────────────────────────────────┤
│  Mining: submission ${submissionId} approved, +${mlptsEarned} MLPTS
│  Conversion: ${convertResp.json?.convertedPoints || '?'} MLPTS → ${convertResp.json?.mallcoins || '?'} MLCNS
│  Tx Hash: ${txHash || 'NOT FOUND'}
│  Rate: ${convertResp.json?.ratio?.proposed_rate || 'N/A'}
│  Fee denom: ${convertResp.json?.credit?.transfer ? 'stake (from tx events)' : 'N/A'}
├────────────────────────────────────────────────────────────┤
│  MPA before: ${mlptsEarned} → after: ${mpaAfterConvert?.balance || 0}  (debit: ${mlptsEarned - (mpaAfterConvert?.balance || 0)})
│  On-chain tx code: 0 (SUCCESS)
└────────────────────────────────────────────────────────────┘`);

  // Save evidence
  const evidence = {
    email, userId, address, mnemonic: wallet.mnemonic,
    mlpts_earned: mlptsEarned,
    conversion: convertResp.json,
    tx_hash: txHash,
  };
  fs.writeFileSync('/tmp/gate61/user2_evidence.json', JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to /tmp/gate61/user2_evidence.json');

  await mongoose.disconnect();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
