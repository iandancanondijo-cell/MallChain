// On-chain buy/sell transaction utilities
// Handles signing and broadcasting of MsgBuyMallcoin and MsgSellMallcoin

import axios from 'axios';

const CHAIN_RPC = import.meta.env.VITE_CHAIN_RPC || 'http://localhost:26657';
const CHAIN_REST = import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317';
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID || 'mallchain-1';
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000').replace(/\/$/, '');

// Import protobuf encoders
import { encodeMsgBuyMallcoin, encodeMsgSellMallcoin, encodeMsgTransferMallcoin, typeUrls } from './proto-encoders.js';
import { loadWallet } from '../mallwallet.js';

// Helper functions to encode Any type wrapper
function encodeStringField(fieldNumber, str) {
  const bytes = new TextEncoder().encode(str);
  const fieldHeader = [(fieldNumber << 3) | 2]; // field number, wire type 2 (length-delimited)
  const lengthBytes = [];
  let len = bytes.length;
  while (len >= 128) {
    lengthBytes.push((len & 0x7f) | 0x80);
    len >>= 7;
  }
  lengthBytes.push(len & 0x7f);
  return new Uint8Array([...fieldHeader, ...lengthBytes, ...bytes]);
}

function encodeBytesField(fieldNumber, data) {
  const fieldHeader = [(fieldNumber << 3) | 2]; // field number, wire type 2 (length-delimited)
  const lengthBytes = [];
  let len = data.length;
  while (len >= 128) {
    lengthBytes.push((len & 0x7f) | 0x80);
    len >>= 7;
  }
  lengthBytes.push(len & 0x7f);
  return new Uint8Array([...fieldHeader, ...lengthBytes, ...data]);
}

function encodeAny(typeUrl, valueBytes) {
  const typeUrlBytes = encodeStringField(1, typeUrl);
  const valueFieldBytes = encodeBytesField(2, valueBytes);
  return new Uint8Array([...typeUrlBytes, ...valueFieldBytes]);
}

/**
 * Execute on-chain buy transaction
 * @param {string} buyerAddress - Buyer's wallet address
 * @param {number} mlcnAmount - Amount of MLCN to buy
 * @param {object} options - Additional options { fee, memo }
 * @returns {Promise<object>} Transaction result with trade details
 */
export async function buyMallcoinOnChain(buyerAddress, mlcnAmount, options = {}) {
  try {
    if (!buyerAddress || !mlcnAmount) {
      throw new Error('Missing required parameters: buyerAddress, mlcnAmount');
    }

    const { fee = { amount: [{ denom: 'stake', amount: '5000' }], gas: '300000' }, memo = '' } = options;

    // Load wallet for signing
    const wallet = await loadWallet();
    if (!wallet) {
      throw new Error('Failed to load wallet for signing');
    }

    // Check if this is a Cosmos wallet
    if (!wallet.isCosmos) {
      throw new Error('On-chain buy/sell requires Cosmos/mnemonic wallet');
    }

    // Dynamically import CosmJS
    const { SigningStargateClient } = await import('@cosmjs/stargate');
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');

    // Get stored mnemonic for signing
    const mnemonicStr = localStorage.getItem('mall_mnemonic');
    if (!mnemonicStr) {
      throw new Error('Mnemonic not found in storage');
    }

    // Create signer wallet from mnemonic
    const signingWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonicStr, { prefix: 'mall' });
    const [account] = await signingWallet.getAccounts();

    // Encode the message using protobuf encoder
    const msgValue = {
      buyer: String(buyerAddress).trim(),
      mlcnAmount: String(Math.floor(Number(mlcnAmount)))
    };
    const msgBytes = Uint8Array.from(encodeMsgBuyMallcoin(msgValue));
    
    // Wrap in Any type that CosmJS understands
    const anyBytes = encodeAny(typeUrls.BUY, msgBytes);

    // Create message as Any type
    const msg = {
      typeUrl: '/google.protobuf.Any',
      value: {
        typeUrl: typeUrls.BUY,
        value: anyBytes
      }
    };

    // Connect to chain and broadcast (no registry needed, Any is native)
    const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, signingWallet);

    const result = await client.signAndBroadcast(account.address, [msg], fee, memo);

    await client.disconnect();

    return {
      success: true,
      txHash: result.transactionHash,
      status: result.code === undefined || result.code === 0 ? 'success' : 'failed',
      raw: result
    };
  } catch (e) {
    console.error('buyMallcoinOnChain error:', e);
    throw e;
  }
}

/**
 * Execute on-chain sell transaction
 * @param {string} sellerAddress - Seller's wallet address
 * @param {number} mlcnAmount - Amount of MLCN to sell
 * @param {object} options - Additional options { fee, memo }
 * @returns {Promise<object>} Transaction result with trade details
 */
export async function sellMallcoinOnChain(sellerAddress, mlcnAmount, options = {}) {
  try {
    if (!sellerAddress || !mlcnAmount) {
      throw new Error('Missing required parameters: sellerAddress, mlcnAmount');
    }

    const { fee = { amount: [{ denom: 'stake', amount: '5000' }], gas: '300000' }, memo = '' } = options;

    // Load wallet for signing
    const wallet = await loadWallet();
    if (!wallet) {
      throw new Error('Failed to load wallet for signing');
    }

    // Check if this is a Cosmos wallet
    if (!wallet.isCosmos) {
      throw new Error('On-chain buy/sell requires Cosmos/mnemonic wallet');
    }

    // Dynamically import CosmJS
    const { SigningStargateClient } = await import('@cosmjs/stargate');
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');

    // Get stored mnemonic for signing
    const mnemonicStr = localStorage.getItem('mall_mnemonic');
    if (!mnemonicStr) {
      throw new Error('Mnemonic not found in storage');
    }

    // Create signer wallet from mnemonic
    const signingWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonicStr, { prefix: 'mall' });
    const [account] = await signingWallet.getAccounts();

    // Encode the message using protobuf encoder
    const msgValue = {
      seller: String(sellerAddress).trim(),
      mlcnAmount: String(Math.floor(Number(mlcnAmount)))
    };
    const msgBytes = Uint8Array.from(encodeMsgSellMallcoin(msgValue));
    
    // Wrap in Any type that CosmJS understands
    const anyBytes = encodeAny(typeUrls.SELL, msgBytes);

    // Create message as Any type
    const msg = {
      typeUrl: '/google.protobuf.Any',
      value: {
        typeUrl: typeUrls.SELL,
        value: anyBytes
      }
    };

    // Connect to chain and broadcast (no registry needed, Any is native)
    const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, signingWallet);

    const txResult = await client.signAndBroadcast(account.address, [msg], fee, memo || '');

    await client.disconnect();

    // Check if transaction was successful
    const code = txResult.code || txResult.tx_response?.code;
    if (code !== null && code !== undefined && code !== 0) {
      throw new Error(`Transaction failed with code ${code}: ${txResult.rawLog || txResult.tx_response?.log}`);
    }

    return {
      success: true,
      txHash: txResult.transactionHash || txResult.tx_response?.txhash,
      status: 'success',
      height: txResult.height || txResult.tx_response?.height,
      raw: txResult
    };
  } catch (e) {
    console.error('sellMallcoinOnChain error:', e);
    throw e;
  }
}

/**
 * Query current market price from chain
 * @returns {Promise<object>} Market price data
 */
export async function getMarketPrice() {
  try {
    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/market/price`;
    const res = await axios.get(url, { timeout: 3000 });
    const data = res.data || {};
    const mp = data.market_price || {};

    // On-chain prices are scaled by 100 (e.g., 39 = 0.39 KES)
    const buyPrice = Number(mp.buy_price) / 100;
    const sellPrice = Number(mp.sell_price) / 100;
    const midPrice = (buyPrice + sellPrice) / 2;

    return {
      buyPrice,
      sellPrice,
      midPrice,
      totalBuyVolume: Number(mp.total_buy_volume || 0),
      totalSellVolume: Number(mp.total_sell_volume || 0),
      source: 'blockchain'
    };
  } catch (e) {
    console.error('getMarketPrice error:', e);
    throw e;
  }
}

/**
 * Query trade history from chain
 * @param {string} address - Wallet address to query trades for
 * @returns {Promise<array>} Array of trade records
 */
export async function getTradeHistory(address) {
  try {
    const url = `${CHAIN_REST.replace(/\/$/, '')}/tmp/marketplace/mlcoin/v1/trades/${address}`;
    const res = await axios.get(url, { timeout: 3000 });
    const data = res.data || {};
    return data.trades || [];
  } catch (e) {
    console.warn('getTradeHistory error:', e);
    return [];
  }
}

/**
 * Estimate KES amount for buying given MLCN amount
 * @param {number} mlcnAmount - Amount of MLCN to buy
 * @param {number} price - Current buy price (can fetch if not provided)
 * @returns {Promise<number>} KES amount needed
 */
export async function estimateBuyPrice(mlcnAmount, price = null) {
  try {
    let buyPrice = price;
    if (buyPrice === null) {
      const marketData = await getMarketPrice();
      buyPrice = marketData.buyPrice;
    }
    return mlcnAmount * buyPrice;
  } catch (e) {
    console.error('estimateBuyPrice error:', e);
    // Fallback to 0.40 KES
    return mlcnAmount * 0.40;
  }
}

/**
 * Estimate KES amount for selling given MLCN amount
 * @param {number} mlcnAmount - Amount of MLCN to sell
 * @param {number} price - Current sell price (can fetch if not provided)
 * @returns {Promise<number>} KES amount to receive
 */
export async function estimateSellPrice(mlcnAmount, price = null) {
  try {
    let sellPrice = price;
    if (sellPrice === null) {
      const marketData = await getMarketPrice();
      sellPrice = marketData.sellPrice;
    }
    return mlcnAmount * sellPrice;
  } catch (e) {
    console.error('estimateSellPrice error:', e);
    // Fallback to 0.38 KES
    return mlcnAmount * 0.38;
  }
}
/**
 * Send mallcoins from one wallet to another (on-chain transfer)
 * Uses Cosmos SDK's standard MsgSend
 * @param {string} fromAddress - Sender's wallet address
 * @param {string} toAddress - Recipient's wallet address
 * @param {number} amount - Amount of MLCN to send
 * @param {object} options - Additional options { fee, memo }
 * @returns {Promise<object>} Transaction result
 */

/**
 * Sign a mallcoin transfer transaction and return the transaction bytes
 * This is used when the backend will handle broadcasting
 * @param {string} fromAddress - Sender's wallet address
 * @param {string} toAddress - Receiver's wallet address
 * @param {number} amount - Amount of MLCN to transfer
 * @param {object} options - Additional options { fee, memo }
 * @returns {Promise<object>} { txBytes (base64-encoded), from, to, amount }
 */
export async function signTransferForBackend(fromAddress, toAddress, amount, options = {}) {
  try {
    console.log('[signTransferForBackend] Preparing transfer:', { fromAddress, toAddress, amount });
    
    if (!fromAddress || !toAddress || !amount) {
      throw new Error('Missing required parameters: fromAddress, toAddress, amount');
    }

    if (fromAddress === toAddress) {
      throw new Error('Cannot send to the same address');
    }

    const { fee = { amount: [{ denom: 'umal', amount: '5000' }], gas: '200000' }, memo = '' } = options;

    // Get stored mnemonic for signing
    const mnemonicStr = localStorage.getItem('mall_mnemonic');
    if (!mnemonicStr) {
      throw new Error('Mnemonic not found in storage');
    }

    // Dynamically import CosmJS
    console.log('[signTransferForBackend] Importing CosmJS modules...');
    const { SigningStargateClient } = await import('@cosmjs/stargate');
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
    const { TxRaw } = await import('cosmjs-types/cosmos/tx/v1beta1/tx');

    // Create signer wallet from mnemonic
    console.log('[signTransferForBackend] Creating signer wallet from mnemonic...');
    const signingWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonicStr, { prefix: 'mall' });
    const [account] = await signingWallet.getAccounts();

    // Fetch account metadata (account_number/sequence) via backend to avoid browser CORS issues on RPC
    let accountNumber;
    let sequence;
    try {
      const metaResp = await axios.get(`${API_BASE}/api/send/account/${account.address}`, { timeout: 7000 });
      accountNumber = metaResp.data?.accountNumber;
      sequence = metaResp.data?.sequence;
    } catch (metaErr) {
      console.warn('[signTransferForBackend] Account metadata fetch via backend failed, will try REST:', metaErr.message);
    }

    if (accountNumber === undefined || sequence === undefined) {
      // Fallback to REST directly if backend is unreachable
      const restUrl = CHAIN_REST.replace(/\/$/, '');
      const accountUrl = `${restUrl}/cosmos/auth/v1beta1/accounts/${account.address}`;
      try {
        const accountResp = await axios.get(accountUrl, { timeout: 7000 });
        const accountInfo = accountResp.data?.account || {};
        const baseAccount = accountInfo.base_account || accountInfo;
        accountNumber = Number(baseAccount.account_number ?? accountInfo.account_number);
        sequence = Number(baseAccount.sequence ?? accountInfo.sequence);
      } catch (restErr) {
        console.error('[signTransferForBackend] Failed to fetch account from REST:', restErr.message);
      }
    }

    // Allow zeroed defaults when account not yet on-chain
    if (accountNumber === undefined || sequence === undefined || Number.isNaN(accountNumber) || Number.isNaN(sequence)) {
      accountNumber = accountNumber ?? 0;
      sequence = sequence ?? 0;
      console.warn('[signTransferForBackend] Using default accountNumber/sequence = 0 (account not found)');
    }

    // Convert amount from MLCN to umal (base units)
    const amountInBaseUnits = Math.floor(Number(amount)) * 1_000_000;
    
    // Create message using standard Cosmos bank send
    const msg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: fromAddress.trim(),
        toAddress: toAddress.trim(),
        amount: [{ denom: 'umal', amount: String(amountInBaseUnits) }]
      }
    };

    // Sign offline to avoid RPC CORS
    console.log('[signTransferForBackend] Signing transaction offline...');
    const offlineClient = await SigningStargateClient.offline(signingWallet);
    const signed = await offlineClient.sign(account.address, [msg], fee, memo, {
      accountNumber,
      sequence,
      chainId: CHAIN_ID,
    });
    const txBytes = TxRaw.encode(signed).finish();
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    console.log('[signTransferForBackend] ✅ Transaction signed, returning txBytes');

    return {
      txBytes: txBytesBase64,
      from: fromAddress,
      to: toAddress,
      amount: amount
    };
  } catch (e) {
    console.error('[signTransferForBackend] ❌ Error:', e.message);
    console.error('[signTransferForBackend] Full error:', e);
    throw e;
  }
}

export async function sendMallcoins(fromAddress, toAddress, amount, options = {}) {
  try {
    console.log('[sendMallcoins] Starting transfer:', { fromAddress, toAddress, amount });
    
    if (!fromAddress || !toAddress || !amount) {
      throw new Error('Missing required parameters: fromAddress, toAddress, amount');
    }

    if (fromAddress === toAddress) {
      throw new Error('Cannot send to the same address');
    }

    const { fee = { amount: [{ denom: 'umal', amount: '5000' }], gas: '200000' }, memo = '' } = options;

    // Load wallet for signing
    const wallet = await loadWallet();
    console.log('[sendMallcoins] Wallet loaded:', wallet?.address);
    
    if (!wallet) {
      throw new Error('Failed to load wallet for signing');
    }

    // Check if this is a Cosmos wallet
    if (!wallet.isCosmos) {
      throw new Error('Transfer requires Cosmos/mnemonic wallet');
    }

    // Dynamically import CosmJS
    console.log('[sendMallcoins] Importing CosmJS modules...');
    const { SigningStargateClient } = await import('@cosmjs/stargate');
    const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');
    const { TxRaw } = await import('cosmjs-types/cosmos/tx/v1beta1/tx');

    // Get stored mnemonic for signing
    const mnemonicStr = localStorage.getItem('mall_mnemonic');
    if (!mnemonicStr) {
      throw new Error('Mnemonic not found in storage');
    }

    // Create signer wallet from mnemonic
    console.log('[sendMallcoins] Creating signer wallet from mnemonic...');
    const signingWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonicStr, { prefix: 'mall' });
    const [account] = await signingWallet.getAccounts();

    // Get account info from chain for sequence number
    console.log('[sendMallcoins] Connecting to RPC:', CHAIN_RPC);
    const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, signingWallet);
    const accountInfo = await client.getAccount(account.address);
    
    if (!accountInfo) {
      throw new Error(`Account ${account.address} does not exist on chain`);
    }

    // Use standard Cosmos SDK MsgSend which CosmJS knows how to handle
    // Convert amount from MLCN to umal (base units) 
    const amountInBaseUnits = Math.floor(Number(amount)) * 1_000_000;
    
    // Create message using standard Cosmos bank send
    const msg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: fromAddress.trim(),
        toAddress: toAddress.trim(),
        amount: [{ denom: 'umal', amount: String(amountInBaseUnits) }]
      }
    };

    // Sign the transaction
    console.log('[sendMallcoins] Signing transaction...');
    const signed = await client.sign(account.address, [msg], fee, memo);
    const txBytes = TxRaw.encode(signed).finish();
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');

    await client.disconnect();

    // Use REST API to broadcast - more reliable than RPC
    console.log('[sendMallcoins] Broadcasting via REST API...');
    const restUrl = CHAIN_REST.replace(/\/$/, '');
    const broadcastRes = await axios.post(
      `${restUrl}/cosmos/tx/v1beta1/txs`,
      {
        tx_bytes: txBytesBase64,
        mode: 'BROADCAST_MODE_SYNC'
      },
      { timeout: 10000 }
    );

    console.log('[sendMallcoins] Broadcast response:', broadcastRes.data);

    const txResponse = broadcastRes.data?.tx_response;
    if (!txResponse) {
      throw new Error('No tx_response in broadcast result');
    }

    // Check if transaction was successful
    if (txResponse.code !== null && txResponse.code !== undefined && txResponse.code !== 0) {
      const errorLog = txResponse.raw_log || txResponse.log || 'Unknown error';
      throw new Error(`Transaction failed with code ${txResponse.code}: ${errorLog}`);
    }

    console.log('[sendMallcoins] ✅ Transaction successful:', txResponse.txhash);

    return {
      success: true,
      txHash: txResponse.txhash,
      status: 'success',
      height: txResponse.height,
      from: fromAddress,
      to: toAddress,
      amount: amount,
      raw: txResponse
    };
  } catch (e) {
    console.error('[sendMallcoins] ❌ Error:', e.message);
    console.error('[sendMallcoins] Full error:', e);
    throw e;
  }
}