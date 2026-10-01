#!/usr/bin/env node
/**
 * End-to-end: MLPTS → MLCNS conversion → P2P send
 * Full real-user flow: register → wallet → mine → convert → verify → send
 */

const http = require('http');
const fs = require('fs');

const BACKEND = 'http://localhost:4000';
const CHAIN_REST = 'http://localhost:1317';

const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');

const ADMIN_EMAIL = 'enochbosire@mallchainadmin.com';
const ADMIN_PASSWORD = 'Admin@mallchain1/2026';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method, headers,
    };
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

function extractToken(res) {
  const sc = res.headers['set-cookie'];
  if (!sc) return null;
  const authCookie = sc.find(c => c.startsWith('auth_token='));
  return authCookie ? authCookie.split(';')[0].split('=')[1] : null;
}

async function chainGet(path) {
  const resp = await fetch(CHAIN_REST + path);
  return resp.json();
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

const ts = Date.now();
const emailA = `e2e_a_${ts}@test.com`;
const emailB = `e2e_b_${ts}@test.com`;
const password = 'TestPass123!';

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  END-TO-END: MLPTS → MLCNS → P2P SEND');
  console.log('='.repeat(70));
  console.log(`Started at ${new Date().toISOString()}\n`);

  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  // ─── STEP 1: Generate wallets client-side ───
  console.log('── STEP 1: Generate wallets ──');
  const walletA = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [acctA] = await walletA.getAccounts();
  const addrA = acctA.address;
  console.log(`  User A: ${addrA}`);

  const walletB = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [acctB] = await walletB.getAccounts();
  const addrB = acctB.address;
  console.log(`  User B: ${addrB}`);
  record('Wallets generated', !!addrA && !!addrB, `A=${addrA.slice(0, 15)}... B=${addrB.slice(0, 15)}...`);

  // ─── STEP 2: Register users ───
  console.log('\n── STEP 2: Register users ──');
  const regA = await req('POST', '/api/auth/register', { email: emailA, password, name: 'E2E User A' });
  const tokenA = extractToken(regA);
  console.log(`  User A register: ${regA.status}, token=${!!tokenA}`);

  const regB = await req('POST', '/api/auth/register', { email: emailB, password, name: 'E2E User B' });
  const tokenB = extractToken(regB);
  console.log(`  User B register: ${regB.status}, token=${!!tokenB}`);

  record('User A registered', regA.status === 200 && !!tokenA);
  record('User B registered', regB.status === 200 && !!tokenB);

  // ─── STEP 3: Link wallets (ADR-036 signature) ───
  console.log('\n── STEP 3: Link wallets ──');
  const linkTsA = new Date().toISOString();
  const linkSigA = await signAdr036(walletA, addrA, `Link wallet ${addrA} to my Mallchain account at ${linkTsA}`, linkTsA);
  const linkResA = await req('POST', '/api/auth/link-wallet', {
    address: addrA, timestamp: linkSigA.timestamp,
    pubKey: linkSigA.pubKeyBase64, signature: linkSigA.signatureBase64,
  }, tokenA);
  console.log(`  Link A: ${linkResA.status}`, JSON.stringify(linkResA.json).slice(0, 150));
  record('User A wallet linked', linkResA.status === 200, `status=${linkResA.status}`);

  const linkTsB = new Date().toISOString();
  const linkSigB = await signAdr036(walletB, addrB, `Link wallet ${addrB} to my Mallchain account at ${linkTsB}`, linkTsB);
  const linkResB = await req('POST', '/api/auth/link-wallet', {
    address: addrB, timestamp: linkSigB.timestamp,
    pubKey: linkSigB.pubKeyBase64, signature: linkSigB.signatureBase64,
  }, tokenB);
  console.log(`  Link B: ${linkResB.status}`, JSON.stringify(linkResB.json).slice(0, 150));
  record('User B wallet linked', linkResB.status === 200, `status=${linkResB.status}`);

  // ─── STEP 4: Verify initial MLCNS = 0 ───
  console.log('\n── STEP 4: Verify initial balances ──');
  const chainA_before = await chainGet(`/tmp/marketplace/mlcoin/v1/wallet_balance/${addrA}`);
  const balA_before = chainA_before?.wallet_balance?.balance || '0';
  console.log(`  User A chain MLCNS before: ${balA_before}`);
  record('User A initial MLCNS = 0', balA_before === '0', `chain=${balA_before}`);

  // ─── STEP 5: Award MLPTS via mining submission + admin approval ───
  console.log('\n── STEP 5: Award MLPTS (mining → admin approval) ──');

  // Submit mining task
  const submission = await req('POST', '/api/mines/submissions', {
    task_type: 'social_media_post',
    platform: 'twitter',
    post_url: 'https://twitter.com/e2e_test/status/12345',
    description: 'E2E test mining submission',
  }, tokenA);
  console.log(`  Mining submit: ${submission.status}`);
  const submissionId = submission.json?.data?._id || submission.json?._id;
  record('Mining task submitted', !!submissionId, `id=${submissionId}`);

  if (!submissionId) {
    console.log('  Submission failed, trying alternative...');
    const sub2 = await req('POST', '/api/mining/submit', {
      taskType: 'social_media_post', platform: 'twitter',
      postUrl: 'https://twitter.com/e2e_test/status/12345',
    }, tokenA);
    console.log(`  Alt mining: ${sub2.status}`, JSON.stringify(sub2.json).slice(0, 200));
  }

  // Admin login + approve
  const adminLogin = await req('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const adminToken = extractToken(adminLogin);
  console.log(`  Admin login: ${adminLogin.status}, token=${!!adminToken}`);

  if (submissionId && adminToken) {
    const approval = await req('POST', `/api/mines/submissions/${submissionId}/approve`, {
      rewardAmount: 100,
    }, adminToken);
    console.log(`  Approval: ${approval.status}`, JSON.stringify(approval.json).slice(0, 200));
    record('MLPTS awarded via admin approval', approval.status === 200, `status=${approval.status}`);
  } else {
    record('MLPTS awarded', false, 'Could not submit or admin login failed');
  }

  // Check MLPTS balance
  const walletA_check = await req('GET', `/api/wallet/${addrA}`, null, tokenA);
  const mlpts = walletA_check.json?.MLPTS || 0;
  console.log(`  User A MLPTS after award: ${mlpts}`);
  record('User A has MLPTS > 0', mlpts > 0, `MLPTS=${mlpts}`);

  if (mlpts <= 0) {
    console.log('\n⚠️  MLPTS not awarded via mining flow. Injecting via MongoDB for conversion test...');
    const { execSync } = require('child_process');
    execSync(`mongosh --host localhost --port 27020 --quiet --eval '
      const db = db.getSiblingDB("marketplace");
      const user = db.users.findOne({email: "${emailA}"});
      if (user) {
        db.mallpointaccounts.updateOne(
          {address: "${addrA}"},
          {$set: {balance: 100, address: "${addrA}", userId: user._id.toString()}},
          {upsert: true}
        );
        db.users.updateOne({email: "${emailA}"}, {$set: {mlpts_balance: 100}});
        print("Injected 100 MLPTS");
      } else {
        print("User not found");
      }
    '`, { encoding: 'utf8' });
  }

  // Re-check MLPTS
  const walletA_check2 = await req('GET', `/api/wallet/${addrA}`, null, tokenA);
  const mlptsFinal = walletA_check2.json?.MLPTS || 0;
  console.log(`  User A MLPTS (final check): ${mlptsFinal}`);

  // ─── STEP 6: Convert MLPTS → MLCNS ───
  console.log('\n── STEP 6: Convert MLPTS → MLCNS ──');

  const convertTs = new Date().toISOString();
  const convertSig = await signAdr036(walletA, addrA, `Convert Mallpoints to Mallcoin for ${addrA} at ${convertTs}`, convertTs);
  const convertRes = await req('POST', '/api/mallpoints/convert', {
    address: addrA,
    timestamp: convertSig.timestamp,
    pubKey: convertSig.pubKeyBase64,
    signature: convertSig.signatureBase64,
  }, tokenA);
  console.log(`  Convert: ${convertRes.status}`, JSON.stringify(convertRes.json).slice(0, 300));

  const converted = convertRes.status === 200;
  record('MLPTS → MLCNS conversion succeeded', converted,
    converted ? `convertedPoints=${convertRes.json?.convertedPoints}, mallcoins=${convertRes.json?.mallcoins}` :
      `status=${convertRes.status}`);

  // ─── STEP 7: Wait for cache + verify MLCNS balance ───
  console.log('\n── STEP 7: Verify MLCNS balance updated ──');
  console.log('  Waiting 32s for backend cache...');
  await new Promise(r => setTimeout(r, 32000));

  const balA_afterConvert = await req('GET', `/api/wallet/${addrA}`, null, tokenA);
  const mallAfter = balA_afterConvert.json?.MALL || 0;
  console.log(`  User A MALL after convert: ${mallAfter}`);

  const chainA_after = await chainGet(`/tmp/marketplace/mlcoin/v1/wallet_balance/${addrA}`);
  const chainBalAfter = chainA_after?.wallet_balance?.balance || '0';
  console.log(`  User A chain after convert: ${chainBalAfter}`);

  const mlcnsBalance = Number(chainBalAfter);
  record('MLCNS balance > 0 after conversion', mlcnsBalance > 0,
    `chain=${chainBalAfter} (${mlcnsBalance / 1e6} MLCNS), backend MALL=${mallAfter}`);

  const backendBase = Math.round(mallAfter * 1e6);
  record('Backend MALL matches chain', backendBase === mlcnsBalance,
    `backend=${backendBase}, chain=${chainBalAfter}`);

  if (mlcnsBalance <= 0) {
    console.log('\nFATAL: MLCNS balance is 0 after conversion.');
    console.log('\n── RESULTS ──');
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`);
    process.exit(1);
  }

  // ─── STEP 8: Send MLCNS P2P (User A → User B) ───
  console.log('\n── STEP 8: P2P send MLCNS (A → B) ──');
  const sendAmount = Math.max(1, Math.floor(mlcnsBalance / 1e6 / 2));
  console.log(`  Sending ${sendAmount} MLCNS from A → B...`);

  const { transferFromMnemonic } = require('./src/services/mallcoinTxBuilder');
  let txResult;
  try {
    txResult = await transferFromMnemonic({
      mnemonic: walletA.mnemonic,
      toAddress: addrB,
      amountMlcns: sendAmount,
      memo: 'E2E conversion→send test',
    });
    console.log(`  TX sent! hash=${txResult.txHash}, height=${txResult.height}`);
    record('P2P send succeeded', true, `txHash=${txResult.txHash}, height=${txResult.height}`);
  } catch (err) {
    console.log(`  TX failed: ${err.message}`);
    // May need auth account — fund stake first
    if (/does not exist|not found/i.test(err.message)) {
      console.log('  User A needs auth account. Funding stake...');
      const { fundStakeFromMnemonic } = require('./src/services/mallcoinTxBuilder');
      // Use the faucet to fund User A with stake tokens
      try {
        await fundStakeFromMnemonic({
          mnemonic: 'governance cage swim bleak answer trend iron seed valve surge below patient',
          toAddress: addrA,
          amountStake: '10',
        });
        console.log('  Funded stake. Retrying transfer...');
        txResult = await transferFromMnemonic({
          mnemonic: walletA.mnemonic,
          toAddress: addrB,
          amountMlcns: sendAmount,
          memo: 'E2E conversion→send test',
        });
        record('P2P send succeeded (after funding)', true, `txHash=${txResult.txHash}`);
      } catch (err2) {
        record('P2P send', false, err2.message.slice(0, 200));
      }
    } else {
      record('P2P send', false, err.message.slice(0, 200));
    }
  }

  // ─── STEP 9: Verify balances after P2P ───
  console.log('\n── STEP 9: Verify balances after P2P send ──');
  console.log('  Waiting 32s for cache...');
  await new Promise(r => setTimeout(r, 32000));

  const balA_final = await req('GET', `/api/wallet/${addrA}`, null, tokenA);
  const balB_final = await req('GET', `/api/wallet/${addrB}`, null, tokenB);
  const chainA_final = await chainGet(`/tmp/marketplace/mlcoin/v1/wallet_balance/${addrA}`);
  const chainB_final = await chainGet(`/tmp/marketplace/mlcoin/v1/wallet_balance/${addrB}`);

  const mallA_final = balA_final.json?.MALL || 0;
  const mallB_final = balB_final.json?.MALL || 0;
  const chainA_finalBal = chainA_final?.wallet_balance?.balance || '0';
  const chainB_finalBal = chainB_final?.wallet_balance?.balance || '0';

  console.log(`  User A: MALL=${mallA_final}, chain=${chainA_finalBal}`);
  console.log(`  User B: MALL=${mallB_final}, chain=${chainB_finalBal}`);

  record('User A MLCNS decreased after send', Number(chainA_finalBal) < mlcnsBalance,
    `before=${mlcnsBalance}, after=${chainA_finalBal}`);
  record('User B received MLCNS', Number(chainB_finalBal) > 0,
    `balance=${chainB_finalBal} (${Number(chainB_finalBal) / 1e6} MLCNS)`);

  const aMatch = Math.round(mallA_final * 1e6) === Number(chainA_finalBal);
  const bMatch = Math.round(mallB_final * 1e6) === Number(chainB_finalBal);
  record('Backend matches chain (User A)', aMatch);
  record('Backend matches chain (User B)', bMatch);

  // Verify on-chain tx record
  const chainTxs = await chainGet('/tmp/marketplace/mlcoin/v1/transactions');
  const txList = chainTxs?.transactions || [];
  const e2eTx = txList.find(tx =>
    tx.from === addrA && tx.to === addrB && tx.memo === 'E2E conversion→send test'
  );
  record('P2P transfer in on-chain tx store', !!e2eTx,
    e2eTx ? `tx_id=${e2eTx.tx_id}, amount=${e2eTx.amount}, block=${e2eTx.block_height}` : 'NOT FOUND');

  // ─── FINAL SUMMARY ───
  console.log(`\n${'='.repeat(70)}`);
  console.log('  FINAL RESULTS');
  console.log('='.repeat(70));

  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n${pass} passed, ${fail} failed out of ${results.length} tests\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }

  fs.writeFileSync('/tmp/gate62/e2e_conversion_send.json', JSON.stringify({
    userA: { email: emailA, address: addrA, mnemonic: walletA.mnemonic },
    userB: { email: emailB, address: addrB, mnemonic: walletB.mnemonic },
    results, pass, fail,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log('\nResults saved to /tmp/gate62/e2e_conversion_send.json');

  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
