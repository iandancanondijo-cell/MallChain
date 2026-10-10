#!/usr/bin/env node
// Gate 61.2 — Phases 8-15: Convert MLPTS → MLCNS and verify on-chain
// Uses the existing test user from /tmp/gate61/user1_linked.json

const fs = require('fs');
const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, fromUtf8, toUtf8 } = require('@cosmjs/encoding');

const BACKEND = 'http://localhost:4000';
const CHAIN_RPC = 'http://localhost:26657';
const CHAIN_REST = 'http://localhost:1317';

function jsonReviver(key, val) { return val; }

function logPhase(n, title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PHASE ${n}: ${title}`);
  console.log('='.repeat(60));
}

async function signAdr036(wallet, address, message) {
  const msg = {
    type: 'sign/MsgSignData',
    value: { signer: address, data: toBase64(toUtf8(message)) },
  };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
  const signResult = await wallet.signAmino(address, signDoc);
  const signatureBase64 = signResult.signature.signature;
  const [acct] = await wallet.getAccounts();
  const pubKeyBase64 = toBase64(acct.pubkey);
  return { signatureBase64, pubKeyBase64 };
}

async function httpPost(url, body, headers = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: resp.status, json };
}

async function httpGet(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: resp.status, json };
}

async function main() {
  const userState = JSON.parse(fs.readFileSync('/tmp/gate61/user1_linked.json', 'utf-8'));
  const { address, authToken, user_id } = userState;
  const mnemonic = userState.mnemonic;

  // ===== PHASE 8: Record exact MLPTS being converted =====
  logPhase(8, 'Record exact MLPTS being converted');

  const mongoose = require('mongoose');
  await mongoose.connect('mongodb://localhost:27020/marketplace?replicaSet=rs0');

  const userId = new mongoose.Types.ObjectId(user_id);
  const userBefore = await mongoose.connection.db.collection('users').findOne(
    { _id: userId }, { projection: { mlpts_balance: 1, mlcns_balance: 1, walletAddress: 1 } }
  );
  const mpaBefore = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address });

  console.log(`User MLPTS before conversion: ${userBefore.mlpts_balance}`);
  console.log(`MallPointAccount balance: ${mpaBefore?.balance || 0}`);
  console.log(`Wallet address: ${address}`);

  const mlptsToConvert = mpaBefore?.balance || 0;
  if (mlptsToConvert <= 0) {
    console.error('ERROR: No MLPTS to convert');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\nMLPTS to convert: ${mlptsToConvert}`);

  // ===== PHASE 9: Real ADR-036 signature for conversion =====
  logPhase(9, 'Real ADR-036 signature for conversion');

  const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'mall' });
  const timestamp = new Date().toISOString();
  const convertMessage = `Convert Mallpoints to Mallcoin for ${address} at ${timestamp}`;
  console.log(`Message: "${convertMessage}"`);
  console.log(`Timestamp: ${timestamp}`);

  const { signatureBase64, pubKeyBase64 } = await signAdr036(wallet, address, convertMessage);
  console.log(`Signature: ${signatureBase64.slice(0, 40)}...`);
  console.log(`PubKey: ${pubKeyBase64}`);

  // ===== PHASE 10: Call the real conversion endpoint =====
  logPhase(10, 'Call the real conversion endpoint');

  const convertBody = {
    address,
    timestamp,
    pubKey: pubKeyBase64,
    signature: signatureBase64,
  };

  console.log(`POST /api/mallpoints/convert`);
  console.log(`Body: ${JSON.stringify(convertBody, null, 2)}`);

  const convertResp = await httpPost(`${BACKEND}/api/mallpoints/convert`, convertBody);
  console.log(`\nHTTP Status: ${convertResp.status}`);
  console.log(`Response: ${JSON.stringify(convertResp.json, null, 2).slice(0, 2000)}`);

  if (convertResp.status !== 200) {
    console.error(`\nERROR: Conversion failed with status ${convertResp.status}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const convertResult = convertResp.json;

  // ===== PHASE 11: Query the transaction directly from Mallchain =====
  logPhase(11, 'Query the transaction directly from Mallchain (DECISIVE PHASE)');

  let txHash = null;
  if (convertResult.transfer?.transactionHash) {
    txHash = convertResult.transfer.transactionHash;
  } else if (convertResult.txHash) {
    txHash = convertResult.txHash;
  } else if (convertResult.data?.txHash) {
    txHash = convertResult.data.txHash;
  }

  // Try to find tx hash in nested response
  if (!txHash) {
    const respStr = JSON.stringify(convertResult);
    const hashMatch = respStr.match(/([A-Fa-f0-9]{64})/);
    if (hashMatch) txHash = hashMatch[1];
  }

  console.log(`Extracted tx hash: ${txHash || 'NOT FOUND'}`);

  if (txHash) {
    // Query via RPC
    const txQuery = await httpGet(`${CHAIN_RPC}/tx?hash=0x${Buffer.from(txHash, 'hex').toString('hex')}`);
    console.log(`\nRPC tx query status: ${txQuery.status}`);
    if (txQuery.json?.result) {
      const txResult = txQuery.json.result;
      console.log(`Tx height: ${txResult.height}`);
      console.log(`Tx hash: ${txResult.hash}`);
      console.log(`Tx code: ${txResult.tx_result?.code ?? 'N/A'}`);
      console.log(`Tx gas used: ${txResult.tx_result?.gas_used ?? 'N/A'}`);

      // Decode tx to see messages
      if (txResult.tx_result?.data) {
        console.log(`Tx data present: yes (${txResult.tx_result.data.length} chars)`);
      }
    } else {
      console.log(`RPC tx response: ${JSON.stringify(txQuery.json).slice(0, 500)}`);
    }

    // Also try REST tx query
    const txRestQuery = await httpGet(`${CHAIN_REST}/cosmos/tx/v1beta1/txs/${txHash}`);
    console.log(`\nREST tx query status: ${txRestQuery.status}`);
    if (txRestQuery.json?.tx_response) {
      console.log(`REST tx height: ${txRestQuery.json.tx_response.height}`);
      console.log(`REST tx code: ${txRestQuery.json.tx_response.code}`);
      console.log(`REST tx gas used: ${txRestQuery.json.tx_response.gas_used}`);
    }
  } else {
    console.log('WARNING: No tx hash found in conversion response');
    console.log('Full response keys:', Object.keys(convertResult));
    if (convertResult.transfer) console.log('Transfer keys:', Object.keys(convertResult.transfer));
  }

  // ===== PHASE 12: Query the block containing the transaction =====
  logPhase(12, 'Query the block containing the transaction');

  let txHeight = null;
  if (txHash) {
    try {
      const txQ = await httpGet(`${CHAIN_RPC}/tx?hash=0x${Buffer.from(txHash, 'hex').toString('hex')}`);
      if (txQ.json?.result?.height) txHeight = txQ.json.result.height;
    } catch {}
  }

  if (txHeight) {
    const blockQuery = await httpGet(`${CHAIN_RPC}/block?height=${txHeight}`);
    console.log(`Block ${txHeight} query status: ${blockQuery.status}`);
    if (blockQuery.json?.result) {
      const block = blockQuery.json.result;
      console.log(`Block hash: ${block.block_id?.hash || 'N/A'}`);
      console.log(`Block time: ${block.block?.header?.time || 'N/A'}`);
      console.log(`Block tx count: ${block.block?.data?.txs?.length || 0}`);
      console.log(`Proposer: ${block.block?.header?.proposer_address || 'N/A'}`);
    }
  } else {
    console.log('Could not determine tx height for block query');
    // Fall back to latest block
    const latestBlock = await httpGet(`${CHAIN_RPC}/block`);
    if (latestBlock.json?.result) {
      console.log(`Latest block height: ${latestBlock.json.result.block?.header?.height}`);
      console.log(`Latest block time: ${latestBlock.json.result.block?.header?.time}`);
    }
  }

  // ===== PHASE 13: Verify MLCNS on-chain (query chain, not MongoDB) =====
  logPhase(13, 'Verify MLCNS on-chain (query chain, not MongoDB)');

  // Query bank balances on chain
  const bankQuery = await httpGet(`${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`);
  console.log(`Bank balances query status: ${bankQuery.status}`);
  let onChainMlcns = 0;
  let onChainStake = 0;
  if (bankQuery.json?.balances) {
    for (const b of bankQuery.json.balances) {
      console.log(`  ${b.denom}: ${b.amount}`);
      if (b.denom === 'MLCNS' || b.denom === 'mallcoin') onChainMlcns = Number(b.amount);
      if (b.denom === 'stake') onChainStake = Number(b.amount);
    }
  } else {
    console.log(`Response: ${JSON.stringify(bankQuery.json).slice(0, 500)}`);
  }

  // Also try the faucet endpoint to see balance
  const balanceQuery = await httpGet(`${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=MLCNS`);
  console.log(`\nMLCNS specific query: ${JSON.stringify(balanceQuery.json)}`);

  // ===== PHASE 14: Verify MLPTS debit in backend =====
  logPhase(14, 'Verify MLPTS debit in backend');

  const userAfter = await mongoose.connection.db.collection('users').findOne(
    { _id: userId }, { projection: { mlpts_balance: 1, mlcns_balance: 1, walletAddress: 1 } }
  );
  const mpaAfter = await mongoose.connection.db.collection('mallpointaccounts').findOne({ address });
  const txsAfter = await mongoose.connection.db.collection('wallettransactions').find({ user_id: userId }).toArray();

  console.log(`User MLPTS after conversion: ${userAfter.mlpts_balance} (was ${userBefore.mlpts_balance})`);
  console.log(`MallPointAccount after: ${mpaAfter?.balance || 0} (was ${mpaBefore?.balance || 0})`);
  console.log(`MLPTS debited: ${userBefore.mlpts_balance - userAfter.mlpts_balance}`);
  console.log(`WalletTransaction count: ${txsAfter.length}`);
  for (const tx of txsAfter) {
    console.log(`  ${tx.type} ${tx.amount} ${tx.currency} - ${tx.description}`);
  }

  // ===== PHASE 15: Cross-layer reconciliation table =====
  logPhase(15, 'Cross-layer reconciliation table');

  console.log(`
┌──────────────────────────────────────────────────────────────────────────┐
│                    CROSS-LAYER RECONCILIATION TABLE                      │
├──────────────────┬──────────────┬──────────────┬─────────────────────────┤
│ Layer            │ Before       │ After        │ Delta                   │
├──────────────────┼──────────────┼──────────────┼─────────────────────────┤
│ MongoDB MLPTS    │ ${String(userBefore.mlpts_balance).padEnd(12)} │ ${String(userAfter.mlpts_balance).padEnd(12)} │ ${String(userBefore.mlpts_balance - userAfter.mlpts_balance).padEnd(23)} │
│ MongoDB MPA      │ ${String(mpaBefore?.balance || 0).padEnd(12)} │ ${String(mpaAfter?.balance || 0).padEnd(12)} │ ${String((mpaBefore?.balance || 0) - (mpaAfter?.balance || 0)).padEnd(23)} │
│ On-chain MLCNS   │ ${String(0).padEnd(12)} │ ${String(onChainMlcns).padEnd(12)} │ ${String(onChainMlcns).padEnd(23)} │
│ On-chain stake   │ ${String(0).padEnd(12)} │ ${String(onChainStake).padEnd(12)} │ ${String(onChainStake).padEnd(23)} │
├──────────────────┴──────────────┴──────────────┴─────────────────────────┤
│ Tx Hash: ${txHash || 'NOT FOUND'}
│ Block Height: ${txHeight || 'NOT FOUND'}
│ Conversion Rate: ${convertResult.rate || convertResult.proposedRate || 'N/A'}
│ MLCNS Credited (API): ${convertResult.mlcoins || convertResult.amount || 'N/A'}
└──────────────────────────────────────────────────────────────────────────┘`);

  // Save evidence
  const evidence = {
    phase8: { mlpts_before: userBefore.mlpts_balance, mpa_before: mpaBefore?.balance },
    phase9: { timestamp, message: convertMessage, signature: signatureBase64, pubKey: pubKeyBase64 },
    phase10: { http_status: convertResp.status, response: convertResult },
    phase11: { tx_hash: txHash },
    phase12: { block_height: txHeight },
    phase13: { on_chain_mlcns: onChainMlcns, on_chain_stake: onChainStake },
    phase14: { mlpts_after: userAfter.mlpts_balance, mpa_after: mpaAfter?.balance },
  };
  fs.writeFileSync('/tmp/gate61/user1_conversion.json', JSON.stringify(evidence, null, 2));
  console.log('\nEvidence saved to /tmp/gate61/user1_conversion.json');

  await mongoose.disconnect();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
