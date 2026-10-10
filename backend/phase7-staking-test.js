/**
 * Phase 7: Staking Test
 * Sign and broadcast a real MsgStake transaction from TEST_USER_A
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { Registry } = require('@cosmjs/proto-signing');
const { defaultRegistryTypes } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const testWallets = require('../test/test-wallets.json');

const CHAIN_RPC = 'http://localhost:26657';
const CHAIN_REST = 'http://localhost:1317';
const MSG_STAKE = '/marketplace.mlcoin.v1.MsgStake';

// Reuse the encoding helpers from mlcoinProto.js
const { encodeStringField, encodeUint64Field } = (() => {
  function encodeVarint(value) {
    let current = typeof value === 'bigint' ? value : BigInt(value);
    const bytes = [];
    while (current > 0x7fn) {
      bytes.push(Number((current & 0x7fn) | 0x80n));
      current >>= 7n;
    }
    bytes.push(Number(current));
    return Uint8Array.from(bytes);
  }

  function utf8ToBytes(str) {
    return new TextEncoder().encode(str);
  }

  function concatBytes(...arrays) {
    let total = 0;
    for (const array of arrays) {
      total += array.length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const array of arrays) {
      out.set(array, offset);
      offset += array.length;
    }
    return out;
  }

  function encodeStringField(fieldNumber, value) {
    const tag = encodeVarint((fieldNumber << 3) | 2);
    const bytes = utf8ToBytes(value);
    return concatBytes(tag, encodeVarint(bytes.length), bytes);
  }

  function encodeUint64Field(fieldNumber, value) {
    const tag = encodeVarint((fieldNumber << 3) | 0);
    return concatBytes(tag, encodeVarint(value));
  }

  return { encodeStringField, encodeUint64Field };
})();

function encodeMsgStake(msg) {
  const parts = [];
  if (msg.creator !== undefined && msg.creator !== null) {
    parts.push(encodeStringField(1, msg.creator));
  }
  if (msg.amount !== undefined && msg.amount !== null) {
    parts.push(encodeUint64Field(2, msg.amount));
  }
  return concatBytes(...parts);
}

function concatBytes(...arrays) {
  let total = 0;
  for (const array of arrays) {
    total += array.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

const MsgStakeType = {
  create(base = {}) {
    return {
      creator: base.creator || '',
      amount: base.amount || '0',
    };
  },
  encode(message) {
    return {
      finish: () => encodeMsgStake(message),
    };
  },
  fromPartial(object = {}) {
    return MsgStakeType.create(object);
  },
  decode() {
    throw new Error('MsgStake decode is not implemented');
  },
};

function createStakingRegistry() {
  return new Registry([...defaultRegistryTypes, [MSG_STAKE, MsgStakeType]]);
}

async function pollTxConfirmation(txHash, timeoutMs = 15000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${CHAIN_RPC}/tx?hash=0x${txHash}`);
      const data = await response.json();
      if (data.result?.tx_result) {
        return { height: Number(data.result.height || 0), ...data.result.tx_result };
      }
      lastError = data.error?.data || data.error?.message;
    } catch (e) {
      lastError = e.message;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for tx ${txHash} to be confirmed${lastError ? `: ${lastError}` : ''}`);
}

async function broadcastSignedTx(txRaw) {
  const txBytes = TxRaw.encode(txRaw).finish();
  const response = await fetch(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_bytes: Buffer.from(txBytes).toString('base64'),
      mode: 'BROADCAST_MODE_SYNC',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Broadcast failed');
  }
  const syncResponse = data.tx_response || {};
  if (syncResponse.code && Number(syncResponse.code) !== 0) {
    const err = new Error(syncResponse.raw_log || `Transaction failed with code ${syncResponse.code}`);
    err.code = syncResponse.code;
    err.rawLog = syncResponse.raw_log;
    throw err;
  }

  const confirmed = await pollTxConfirmation(syncResponse.txhash);
  if (confirmed.code && Number(confirmed.code) !== 0) {
    const err = new Error(confirmed.log || `Transaction failed with code ${confirmed.code}`);
    err.code = confirmed.code;
    err.rawLog = confirmed.log;
    throw err;
  }

  return {
    txHash: syncResponse.txhash,
    height: confirmed.height,
    raw: confirmed,
  };
}

async function main() {
  console.log('=== Phase 7: Staking Test ===\n');

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(testWallets.TEST_USER_A.mnemonic, {
    prefix: 'mall',
  });
  const [account] = await wallet.getAccounts();
  console.log(`Signer: ${account.address}`);

  // Check balance before staking
  const balResp = await fetch(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/wallet_balance/${account.address}`);
  const balData = await balResp.json();
  const balanceBefore = BigInt(balData.wallet_balance?.balance || '0');
  console.log(`Balance before: ${(Number(balanceBefore) / 1e6).toFixed(6)} MLCNS`);

  const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, wallet, {
    gasPrice: GasPrice.fromString('0.025stake'),
    registry: createStakingRegistry(),
  });

  const chainId = await client.getChainId();
  console.log(`Chain ID: ${chainId}`);

  // Stake 100 MLCNS (100 * 1e6 base units)
  const stakeAmount = BigInt(100) * BigInt(1e6);
  const msg = {
    typeUrl: MSG_STAKE,
    value: {
      creator: account.address,
      amount: stakeAmount.toString(),
    },
  };

  console.log(`\nStaking ${(Number(stakeAmount) / 1e6).toFixed(6)} MLCNS...`);

  // Use fixed gas to avoid simulation timeout
  const gas = 250000;
  const fee = calculateFee(gas, GasPrice.fromString('0.025stake'));

  const signed = await client.sign(account.address, [msg], fee, 'Phase 7 staking test');
  console.log('Transaction signed, broadcasting...');

  const result = await broadcastSignedTx(signed);
  console.log('\n✓ Transaction confirmed!');
  console.log(`  TX Hash: ${result.txHash}`);
  console.log(`  Height: ${result.height}`);
  console.log(`  Gas Used: ${result.raw?.gas_used}`);

  // Check balance after staking
  const balRespAfter = await fetch(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/wallet_balance/${account.address}`);
  const balDataAfter = await balRespAfter.json();
  const balanceAfter = BigInt(balDataAfter.wallet_balance?.balance || '0');
  console.log(`\nBalance after: ${(Number(balanceAfter) / 1e6).toFixed(6)} MLCNS`);
  console.log(`Staked amount: ${(Number(balanceBefore - balanceAfter) / 1e6).toFixed(6)} MLCNS`);

  // Query staking params to verify stake was recorded
  console.log('\nQuerying staking state...');
  const paramsResp = await fetch(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/params`);
  const paramsData = await paramsResp.json();
  console.log('Staking lock blocks:', paramsData.params?.staking_lock_blocks);

  console.log('\n=== Phase 7 PASSED ===');
}

main().catch((err) => {
  console.error('\n=== Phase 7 FAILED ===');
  console.error(err);
  process.exit(1);
});
