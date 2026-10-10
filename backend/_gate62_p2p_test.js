#!/usr/bin/env node
/**
 * Gate 62 — MLCNS P2P Transfer Acceptance Test
 * Phases 3-14: Fresh User A conversion, User B creation, P2P transfer, on-chain verification
 */

const fs = require('fs');
const http = require('http');
const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');
const mongoose = require('mongoose');

const BACKEND = 'http://localhost:4000';
const CHAIN_REST = 'http://localhost:1317';
const CHAIN_RPC = 'http://localhost:26657';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'TestAdmin123';

function logPhase(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  GATE 62 — ${title}`);
  console.log('='.repeat(70));
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

async function chainGet(path) {
  const resp = await fetch(CHAIN_REST + path);
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: resp.status, json };
}

async function rpcGet(path) {
  const resp = await fetch(CHAIN_RPC + path);
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

async function getMlcnsBalanceDirect(address) {
  const res = await chainGet(`/tmp/marketplace/mlcoin/v1/wallet_balance/${address}`);
  if (res.status === 404) return { exists: false, balance: '0', locked: '0', available: '0' };
  const wb = res.json?.wallet_balance || res.json?.walletBalance || {};
  const balance = BigInt(wb.balance || 0);
  const locked = BigInt(wb.locked || 0);
  const available = balance > locked ? balance - locked : 0n;
  return {
    exists: true,
    balance: balance.toString(),
    locked: locked.toString(),
    available: available.toString(),
    balanceDisplay: Number(balance) / 1e6,
    availableDisplay: Number(available) / 1e6,
  };
}

async function getGasBalance(address) {
  const res = await chainGet(`/cosmos/bank/v1beta1/balances/${address}`);
  const balances = res.json?.balances || [];
  const stake = balances.find(b => b.denom === 'stake');
  return stake ? BigInt(stake.amount) : 0n;
}

async function getTxFromChain(txHash) {
  const res = await rpcGet(`/tx?hash=0x${txHash}`);
  return res.json?.result || null;
}

async function main() {
  const evidence = {};
  const startTime = new Date().toISOString();
  console.log(`Gate 62 P2P Test started at ${startTime}`);

  // ===== PHASE 3: Create User A =====
  logPhase('PHASE 3: Create User A (fresh disposable user)');
  const tsA = Date.now();
  const emailA = `gate62a_${tsA}@test.com`;
  const passwordA = 'SimplePass123';

  const regResA = await postJson('/api/auth/register', { email: emailA, password: passwordA, name: 'Gate62 UserA' });
  console.log('Register A status:', regResA.status);
  if (regResA.status !== 200 && regResA.status !== 201) {
    console.log('Register A failed:', JSON.stringify(regResA.json));
    process.exit(1);
  }
  const authCookieA = (regResA.headers['set-cookie'] || []).find(c => c.startsWith('auth_token='));
  const tokenA = authCookieA ? authCookieA.split(';')[0].split('=')[1] : null;
  const meResA = await getJson('/api/auth/me', tokenA);
  const userIdA = meResA.json._id || meResA.json.user?._id;
  console.log(`User A: email=${emailA}, id=${userIdA}`);

  // ===== PHASE 3b: Generate wallet + link for User A =====
  logPhase('PHASE 3b: User A — generate wallet + ADR-036 link');
  const walletA = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [acctA] = await walletA.getAccounts();
  const addrA = acctA.address;
  console.log(`User A address: ${addrA}`);
  console.log(`User A mnemonic: ${walletA.mnemonic}`);

  const linkTsA = new Date().toISOString();
  const linkMsgA = `Link wallet ${addrA} to my Mallchain account at ${linkTsA}`;
  const linkSigA = await signAdr036(walletA, addrA, linkMsgA, linkTsA);

  const linkResA = await postJson('/api/auth/link-wallet', {
    address: addrA,
    timestamp: linkSigA.timestamp,
    pubKey: linkSigA.pubKeyBase64,
    signature: linkSigA.signatureBase64,
  }, tokenA);
  console.log('Link wallet A status:', linkResA.status);
  if (linkResA.status !== 200) {
    console.error('ERROR: Wallet link A failed:', JSON.stringify(linkResA.json));
    process.exit(1);
  }
  console.log('Wallet A linked successfully');

  // ===== PHASE 3c: Earn MLPTS via mining =====
  logPhase('PHASE 3c: User A — earn MLPTS via mining submission');
  const submissionA = await postJson('/api/mines/submissions', {
    task_type: 'social_media_post',
    platform: 'twitter',
    post_url: 'https://twitter.com/gate62a_test/status/999999',
    description: 'Gate 62 User A test submission',
  }, tokenA);
  console.log('Submission A status:', submissionA.status);
  const submissionIdA = submissionA.json?.data?._id || submissionA.json?._id;
  console.log('Submission A ID:', submissionIdA);

  // Login as admin to approve
  const adminLogin = await postJson('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const adminCookie = (adminLogin.headers['set-cookie'] || []).find(c => c.startsWith('auth_token='));
  const adminToken = adminCookie ? adminCookie.split(';')[0].split('=')[1] : null;

  const approvalA = await postJson(`/api/mines/submissions/${submissionIdA}/approve`, { rewardAmount: 200 }, adminToken);
  console.log('Approval A status:', approvalA.status);
  console.log('Approval A response:', JSON.stringify(approvalA.json).slice(0, 300));

  await new Promise(r => setTimeout(r, 1500));

  // Verify MLPTS credited in MongoDB
  await mongoose.connect('mongodb://localhost:27020/marketplace?replicaSet=rs0');
  const uidA = new mongoose.Types.ObjectId(userIdA);
  const userAAfterMine = await mongoose.connection.db.collection('users').findOne(
    { _id: uidA }, { projection: { mlpts_balance: 1, walletAddress: 1 } }
  );
  const mpaAAfterMine = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address: addrA });
  const mlptsEarnedA = mpaAAfterMine?.balance || 0;
  console.log(`User A MLPTS after mining: User.mlpts_balance=${userAAfterMine.mlpts_balance}, MPA.balance=${mlptsEarnedA}`);

  if (mlptsEarnedA <= 0) {
    console.error('ERROR: MLPTS not credited to User A');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ===== PHASE 4: Convert MLPTS → MLCNS =====
  logPhase('PHASE 4: User A — convert MLPTS to MLCNS');
  const convertTsA = new Date().toISOString();
  const convertMsgA = `Convert Mallpoints to Mallcoin for ${addrA} at ${convertTsA}`;
  const convertSigA = await signAdr036(walletA, addrA, convertMsgA, convertTsA);

  const convertResA = await postJson('/api/mallpoints/convert', {
    address: addrA,
    timestamp: convertSigA.timestamp,
    pubKey: convertSigA.pubKeyBase64,
    signature: convertSigA.signatureBase64,
  });
  console.log('Convert A status:', convertResA.status);
  console.log('Convert A response:', JSON.stringify(convertResA.json, null, 2).slice(0, 2000));

  if (convertResA.status !== 200) {
    console.error('ERROR: Conversion A failed');
    await mongoose.disconnect();
    process.exit(1);
  }

  const convertedPointsA = convertResA.json?.convertedPoints;
  const mallcoinsA = convertResA.json?.mallcoins;
  const txHashCreditA = convertResA.json?.credit?.transfer?.txHash;
  console.log(`Converted: ${convertedPointsA} MLPTS → ${mallcoinsA} MLCNS`);
  console.log(`Credit tx hash: ${txHashCreditA}`);

  // ===== PHASE 4b: Verify on-chain balance (INDEPENDENT QUERY) =====
  logPhase('PHASE 4b: User A — verify on-chain MLCNS balance (independent)');
  await new Promise(r => setTimeout(r, 3000));

  const balA_direct = await getMlcnsBalanceDirect(addrA);
  console.log(`User A on-chain balance (direct query): ${balA_direct.balanceDisplay} MLCNS (exists: ${balA_direct.exists})`);
  console.log(`  Raw balance: ${balA_direct.balance}, locked: ${balA_direct.locked}, available: ${balA_direct.available}`);

  const gasA = await getGasBalance(addrA);
  console.log(`User A gas (stake) balance: ${Number(gasA) / 1e6}`);

  if (!balA_direct.exists || Number(balA_direct.balance) === 0) {
    console.error('ERROR: User A has no on-chain MLCNS balance after conversion');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Also verify via backend API
  const balA_api = await getJson(`/api/wallet/${addrA}`);
  console.log(`User A backend API balance: MALL=${balA_api.json?.MALL}`);

  // Verify credit tx on-chain
  if (txHashCreditA) {
    const txData = await getTxFromChain(txHashCreditA);
    if (txData) {
      console.log(`Credit tx height: ${txData.height}, code: ${txData.tx_result?.code}`);
      const events = txData.tx_result?.events || [];
      for (const e of events) {
        if (e.type === 'mlcoin_transfer') {
          const attrs = {};
          for (const a of e.attributes) attrs[a.key] = a.value;
          console.log(`  mlcoin_transfer: from=${attrs.from} to=${attrs.to} amount=${attrs.amount}`);
        }
      }
    }
  }

  // Record pre-transfer state
  const preTransferBalA = balA_direct;
  evidence.userA = {
    email: emailA, userId: userIdA, address: addrA, mnemonic: walletA.mnemonic,
    mlptsEarned: mlptsEarnedA, convertedPoints: convertedPointsA, mallcoins: mallcoinsA,
    creditTxHash: txHashCreditA,
    preTransferBalance: balA_direct,
  };

  // ===== PHASE 4c: Balance persistence test =====
  logPhase('PHASE 4c: User A — balance persistence (wait 5s, re-query)');
  await new Promise(r => setTimeout(r, 5000));
  const balA_persist = await getMlcnsBalanceDirect(addrA);
  console.log(`User A balance after 5s wait: ${balA_persist.balanceDisplay} MLCNS`);
  if (balA_persist.balance !== balA_direct.balance) {
    console.error('WARNING: Balance changed without any transfer!');
    console.error(`  Before: ${balA_direct.balance}, After: ${balA_persist.balance}`);
  } else {
    console.log('PASS: Balance persisted correctly');
  }

  // ===== PHASE 5: Create User B =====
  logPhase('PHASE 5: Create User B (P2P recipient)');
  const tsB = Date.now();
  const emailB = `gate62b_${tsB}@test.com`;
  const passwordB = 'SimplePass123';

  const regResB = await postJson('/api/auth/register', { email: emailB, password: passwordB, name: 'Gate62 UserB' });
  console.log('Register B status:', regResB.status);
  const authCookieB = (regResB.headers['set-cookie'] || []).find(c => c.startsWith('auth_token='));
  const tokenB = authCookieB ? authCookieB.split(';')[0].split('=')[1] : null;
  const meResB = await getJson('/api/auth/me', tokenB);
  const userIdB = meResB.json._id || meResB.json.user?._id;
  console.log(`User B: email=${emailB}, id=${userIdB}`);

  // ===== PHASE 5b: Generate wallet + link for User B =====
  logPhase('PHASE 5b: User B — generate wallet + ADR-036 link');
  const walletB = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [acctB] = await walletB.getAccounts();
  const addrB = acctB.address;
  console.log(`User B address: ${addrB}`);
  console.log(`User B mnemonic: ${walletB.mnemonic}`);

  const linkTsB = new Date().toISOString();
  const linkMsgB = `Link wallet ${addrB} to my Mallchain account at ${linkTsB}`;
  const linkSigB = await signAdr036(walletB, addrB, linkMsgB, linkTsB);

  const linkResB = await postJson('/api/auth/link-wallet', {
    address: addrB,
    timestamp: linkSigB.timestamp,
    pubKey: linkSigB.pubKeyBase64,
    signature: linkSigB.signatureBase64,
  }, tokenB);
  console.log('Link wallet B status:', linkResB.status);
  if (linkResB.status !== 200) {
    console.error('ERROR: Wallet link B failed:', JSON.stringify(linkResB.json));
    await mongoose.disconnect();
    process.exit(1);
  }

  // ===== PHASE 6: Record User B pre-transfer balance =====
  logPhase('PHASE 6: User B — pre-transfer balance (should be 0 or non-existent)');
  const balB_pre = await getMlcnsBalanceDirect(addrB);
  console.log(`User B pre-transfer balance: ${balB_pre.balanceDisplay} MLCNS (exists: ${balB_pre.exists})`);
  evidence.userB = {
    email: emailB, userId: userIdB, address: addrB, mnemonic: walletB.mnemonic,
    preTransferBalance: balB_pre,
  };

  // ===== PHASE 7: P2P Transfer from A → B =====
  logPhase('PHASE 7: P2P Transfer — User A → User B (10 MLCNS)');

  // Use transferFromMnemonic from mallcoinTxBuilder
  const { transferFromMnemonic } = require('./src/services/mallcoinTxBuilder');

  const transferAmount = 10; // MLCNS
  console.log(`Transferring ${transferAmount} MLCNS from ${addrA} to ${addrB}`);

  let transferResult;
  try {
    transferResult = await transferFromMnemonic({
      mnemonic: walletA.mnemonic,
      toAddress: addrB,
      amountMlcns: transferAmount,
      memo: 'Gate62 P2P test',
    });
    console.log('Transfer result:', JSON.stringify(transferResult, null, 2));
  } catch (err) {
    console.error('ERROR: Transfer failed:', err.message);
    if (err.rawLog) console.error('Raw log:', err.rawLog);
    await mongoose.disconnect();
    process.exit(1);
  }

  const p2pTxHash = transferResult.txHash;
  console.log(`P2P transfer tx hash: ${p2pTxHash}`);

  // ===== PHASE 8: Verify transfer on-chain =====
  logPhase('PHASE 8: Verify P2P transfer on-chain (DECISIVE)');
  await new Promise(r => setTimeout(r, 3000));

  const txData = await getTxFromChain(p2pTxHash);
  if (!txData) {
    console.error('ERROR: P2P transfer tx not found on chain');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Tx height: ${txData.height}`);
  console.log(`Tx code: ${txData.tx_result?.code} (0 = success)`);
  console.log(`Tx gas used: ${txData.tx_result?.gas_used}`);

  if (txData.tx_result?.code !== 0) {
    console.error('ERROR: Transaction failed on-chain!');
    console.error('Raw log:', txData.tx_result?.raw_log);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Extract mlcoin_transfer events
  const events = txData.tx_result?.events || [];
  let transferEvent = null;
  for (const e of events) {
    if (e.type === 'mlcoin_transfer') {
      const attrs = {};
      for (const a of e.attributes) attrs[a.key] = a.value;
      transferEvent = attrs;
      console.log(`\nmlcoin_transfer event:`);
      console.log(`  from: ${attrs.from}`);
      console.log(`  to: ${attrs.to}`);
      console.log(`  amount: ${attrs.amount}`);
      console.log(`  fee: ${attrs.fee}`);
      console.log(`  tx_id: ${attrs.tx_id}`);
    }
  }

  if (!transferEvent) {
    console.error('ERROR: No mlcoin_transfer event found in tx');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Verify event fields
  if (transferEvent.from !== addrA) {
    console.error(`ERROR: Event from=${transferEvent.from} != expected ${addrA}`);
  }
  if (transferEvent.to !== addrB) {
    console.error(`ERROR: Event to=${transferEvent.to} != expected ${addrB}`);
  }

  evidence.transfer = {
    txHash: p2pTxHash,
    height: txData.height,
    from: transferEvent.from,
    to: transferEvent.to,
    amount: transferEvent.amount,
    fee: transferEvent.fee,
    txId: transferEvent.tx_id,
    gasUsed: txData.tx_result?.gas_used,
  };

  // ===== PHASE 9: Verify post-transfer balances =====
  logPhase('PHASE 9: Post-transfer balance verification');

  const balA_post = await getMlcnsBalanceDirect(addrA);
  const balB_post = await getMlcnsBalanceDirect(addrB);

  console.log(`User A balance: ${preTransferBalA.balanceDisplay} → ${balA_post.balanceDisplay} MLCNS`);
  console.log(`User B balance: ${balB_pre.balanceDisplay} → ${balB_post.balanceDisplay} MLCNS`);

  // Calculate expected values
  const preBalA = BigInt(preTransferBalA.balance);
  const postBalA = BigInt(balA_post.balance);
  const postBalB = BigInt(balB_post.balance);
  const transferAmountBase = BigInt(transferAmount) * BigInt(1e6);

  // Fee is 0.00097% = 97/10000000 of the transfer amount, minimum 1
  // From x/mlcoin/keeper/msg_server_transfer_mallcoin.go:59-61:
  // fee = amount * 97 / 10000000
  const expectedFee = BigInt(Math.max(1, Math.floor(Number(transferAmountBase) * 97 / 10000000)));
  const expectedDebitA = transferAmountBase + expectedFee;
  const expectedBalA = preBalA - expectedDebitA;
  const expectedBalB = BigInt(balB_pre.balance) + transferAmountBase;

  console.log(`\nExpected User A: ${expectedBalA} (debit: ${expectedDebitA} = ${transferAmountBase} + ${expectedFee} fee)`);
  console.log(`Actual User A:   ${postBalA}`);
  console.log(`Match A: ${postBalA === expectedBalA ? 'PASS' : 'FAIL'}`);

  console.log(`\nExpected User B: ${expectedBalB}`);
  console.log(`Actual User B:   ${postBalB}`);
  console.log(`Match B: ${postBalB === expectedBalB ? 'PASS' : 'FAIL'}`);

  evidence.balances = {
    userA_pre: preTransferBalA.balance,
    userA_post: balA_post.balance,
    userA_expected: expectedBalA.toString(),
    userA_match: postBalA === expectedBalA,
    userB_pre: balB_pre.balance,
    userB_post: balB_post.balance,
    userB_expected: expectedBalB.toString(),
    userB_match: postBalB === expectedBalB,
    transferAmount: transferAmountBase.toString(),
    fee: expectedFee.toString(),
  };

  // ===== PHASE 10: Cross-layer reconciliation =====
  logPhase('PHASE 10: Cross-layer reconciliation');

  // Backend API query (may be cached for 30s)
  const balA_api_post = await getJson(`/api/wallet/${addrA}`);
  const balB_api_post = await getJson(`/api/wallet/${addrB}`);
  console.log(`Backend API User A MALL: ${balA_api_post.json?.MALL}`);
  console.log(`Backend API User B MALL: ${balB_api_post.json?.MALL}`);

  // Send endpoint balance
  const balA_send = await getJson(`/api/send/mlcns/balance/${addrA}`);
  const balB_send = await getJson(`/api/send/mlcns/balance/${addrB}`);
  console.log(`Send API User A available: ${balA_send.json?.availableDisplay}`);
  console.log(`Send API User B available: ${balB_send.json?.availableDisplay}`);

  // MongoDB check (MLPTS should be unchanged by P2P transfer)
  const userAAfterTransfer = await mongoose.connection.db.collection('users').findOne(
    { _id: uidA }, { projection: { mlpts_balance: 1 } }
  );
  const mpaAAfterTransfer = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address: addrA });
  console.log(`MongoDB User A mlpts_balance: ${userAAfterTransfer.mlpts_balance} (should be unchanged from ${userAAfterMine.mlpts_balance})`);
  console.log(`MongoDB MPA A balance: ${mpaAAfterTransfer?.balance} (should be 0, unchanged)`);

  evidence.reconciliation = {
    apiA: balA_api_post.json?.MALL,
    apiB: balB_api_post.json?.MALL,
    sendApiA: balA_send.json?.availableDisplay,
    sendApiB: balB_send.json?.availableDisplay,
    mongoUserA_mlpts: userAAfterTransfer.mlpts_balance,
    mongoMpaA: mpaAAfterTransfer?.balance,
  };

  // ===== PHASE 11: Transaction history verification =====
  logPhase('PHASE 11: Transaction history verification');

  // Check if the transfer appears in transaction query endpoints
  const txStatus = await getJson(`/api/send/status/${p2pTxHash}`);
  console.log(`Tx status via API:`, JSON.stringify(txStatus.json).slice(0, 300));

  // ===== PHASE 12: Supply conservation check =====
  logPhase('PHASE 12: MLCNS supply conservation');

  const supplyRes = await chainGet('/cosmos/bank/v1beta1/supply');
  const mlcoinSupply = (supplyRes.json?.supply || []).find(s => s.denom === 'mlcoin');
  console.log(`On-chain mlcoin supply: ${mlcoinSupply?.amount || 'unknown'}`);

  // Total MLCNS should be conserved: A_debit = B_credit + fee
  // The fee goes to FeesAccumulated in the mlcoin module, not destroyed
  const totalBefore = BigInt(preTransferBalA.balance) + BigInt(balB_pre.balance);
  const totalAfter = BigInt(balA_post.balance) + BigInt(balB_post.balance);
  const diff = totalBefore - totalAfter;
  console.log(`Total MLCNS before: ${totalBefore}`);
  console.log(`Total MLCNS after:  ${totalAfter}`);
  console.log(`Difference (fee):   ${diff} (should equal transfer fee ${expectedFee})`);
  console.log(`Supply conservation: ${diff === expectedFee ? 'PASS' : 'FAIL'}`);

  evidence.supplyConservation = {
    totalBefore: totalBefore.toString(),
    totalAfter: totalAfter.toString(),
    difference: diff.toString(),
    expectedFee: expectedFee.toString(),
    pass: diff === expectedFee,
  };

  // ===== FINAL SUMMARY =====
  logPhase('FINAL SUMMARY');

  const allPass = (
    postBalA === expectedBalA &&
    postBalB === expectedBalB &&
    txData.tx_result?.code === 0 &&
    transferEvent?.from === addrA &&
    transferEvent?.to === addrB &&
    diff === expectedFee
  );

  console.log(`
┌──────────────────────────────────────────────────────────────────┐
│  GATE 62 — P2P TRANSFER ACCEPTANCE RESULTS                      │
├──────────────────────────────────────────────────────────────────┤
│  User A: ${emailA}
│  User A wallet: ${addrA}
│  User B: ${emailB}
│  User B wallet: ${addrB}
├──────────────────────────────────────────────────────────────────┤
│  MLPTS earned: ${mlptsEarnedA}
│  MLPTS→MLCNS: ${convertedPointsA} → ${mallcoinsA}
│  Credit tx: ${txHashCreditA}
├──────────────────────────────────────────────────────────────────┤
│  P2P transfer: ${transferAmount} MLCNS from A → B
│  P2P tx: ${p2pTxHash}
│  Tx height: ${txData.height}
│  Tx code: ${txData.tx_result?.code} (0=success)
├──────────────────────────────────────────────────────────────────┤
│  On-chain event: from=${transferEvent?.from?.slice(0,20)}... to=${transferEvent?.to?.slice(0,20)}...
│  Event amount: ${transferEvent?.amount}
│  Event fee: ${transferEvent?.fee}
├──────────────────────────────────────────────────────────────────┤
│  User A balance: ${preTransferBalA.balanceDisplay} → ${balA_post.balanceDisplay} (expected debit: ${Number(expectedDebitA)/1e6})
│  User B balance: ${balB_pre.balanceDisplay} → ${balB_post.balanceDisplay} (expected credit: ${transferAmount})
│  Balance A match: ${postBalA === expectedBalA ? 'PASS ✅' : 'FAIL ❌'}
│  Balance B match: ${postBalB === expectedBalB ? 'PASS ✅' : 'FAIL ❌'}
│  Supply conservation: ${diff === expectedFee ? 'PASS ✅' : 'FAIL ❌'}
├──────────────────────────────────────────────────────────────────┤
│  OVERALL: ${allPass ? 'PASS ✅' : 'FAIL ❌'}
└──────────────────────────────────────────────────────────────────┘`);

  // Save evidence
  evidence.summary = {
    startTime,
    endTime: new Date().toISOString(),
    allPass,
    userA_email: emailA,
    userB_email: emailB,
    transferAmount,
    p2pTxHash,
  };

  fs.mkdirSync('/tmp/gate62', { recursive: true });
  fs.writeFileSync('/tmp/gate62/evidence.json', JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to /tmp/gate62/evidence.json');

  await mongoose.disconnect();

  if (!allPass) {
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
