const axios = require('axios');
const logger = require('../utils/logger');
const { AppError, ErrorCodes } = require('../utils/errorHandler');
const {
  getWalletBalance,
  getMarketPrice,
  getActivityMetrics,
  isValidAddress,
} = require('../services/mallcoinService');
const { signAndBroadcastTransfer } = require('../services/mallcoinTxBuilder');
const { config } = require('../config');

const CHAIN_RPC = process.env.CHAIN_RPC || 'http://localhost:26657';
const CHAIN_REST = (config.chain.rest || 'http://localhost:1317').replace(/\/$/, '');

function normalizeTxBytes(txBytes) {
  if (!txBytes) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'txBytes is required', 400);
  }
  if (Array.isArray(txBytes)) {
    return Buffer.from(Uint8Array.from(txBytes)).toString('base64');
  }
  if (typeof txBytes !== 'string') {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'txBytes must be a base64 string', 400);
  }
  try {
    Buffer.from(txBytes, 'base64')
    return txBytes
  } catch (e) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'txBytes is not valid base64', 400, {
      error: e.message,
    })
  }
}

async function broadcastTx(txBytes, mode = 'BROADCAST_MODE_SYNC') {
  const broadcastUrl = `${CHAIN_REST}/cosmos/tx/v1beta1/txs`;
  const payload = {
    tx_bytes: normalizeTxBytes(txBytes),
    mode,
  };

  try {
    const response = await axios.post(broadcastUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data || {};
  } catch (err) {
    logger.error('sendController.broadcastTx', 'Broadcast failed', err, { broadcastUrl });
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      throw new AppError(ErrorCodes.BLOCKCHAIN_UNAVAILABLE, 'Blockchain is not responding', 503, {
        broadcastUrl,
      });
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new AppError(ErrorCodes.RPC_TIMEOUT, 'Blockchain request timed out', 504, {
        broadcastUrl,
      });
    }
    throw new AppError(ErrorCodes.RPC_ERROR, 'Blockchain broadcast error', 503, {
      broadcastUrl,
      responseStatus: err.response?.status,
      responseData: err.response?.data,
    });
  }
}

/**
 * Send mallcoins from one wallet to another
 * POST /api/send/mallcoins
 * Body: { from, to, amount, txBytes (optional, pre-signed) }
 */
exports.sendMallcoins = async (req, res) => {
  const body = req.validatedBody || req.body;
  const { from, to, amount, txBytes } = body;

  logger.info('sendMallcoins', 'Processing mallcoin transfer', { from, to, amount });

  if (!from || !to || !amount) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'Missing required fields: from, to, amount', 400);
  }

  const normalizedTxBytes = normalizeTxBytes(txBytes);
  const txBytesPreview = `${normalizedTxBytes.slice(0, 24)}... (len=${normalizedTxBytes.length})`;
  logger.debug('sendMallcoins', 'txBytes preview', { txBytesPreview });

  const chainResp = await broadcastTx(normalizedTxBytes);
  const txHash = chainResp.tx_response?.txhash || chainResp.txhash;
  const code = chainResp.tx_response?.code || chainResp.code;

  if (code && code !== 0) {
    const errorLog = chainResp.tx_response?.raw_log || chainResp.raw_log;
    logger.warn('sendMallcoins', 'Transaction failed on chain', { code, txHash, errorLog });
    throw new AppError(
      ErrorCodes.INVALID_TRANSACTION,
      'Transaction failed during broadcast',
      400,
      { code, txHash, errorLog }
    );
  }

  logger.info('sendMallcoins', 'Transaction broadcast successfully', { txHash, from, to, amount });
  return res.json({
    success: true,
    txHash,
    from,
    to,
    amount,
    network: config.chain.id,
    denom: 'MLCNS',
  });
};

/**
 * Process payment using mallcoins
 * POST /api/send/payment
 * Body: { buyerAddress, sellerAddress, amountKES, description }
 */
exports.processPayment = async (req, res) => {
  const body = req.validatedBody || req.body;
  const { buyerAddress, sellerAddress, amountKES, txBytes, description } = body;

  logger.info('processPayment', 'Processing mallcoin payment', { buyerAddress, sellerAddress, amountKES });

  if (!buyerAddress || !sellerAddress || !amountKES) {
    throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, 'Missing required payment fields', 400);
  }

  const normalizedTxBytes = normalizeTxBytes(txBytes);

  try {
    const priceUrl = `${CHAIN_REST}/tmp/marketplace/mlcoin/v1/market/price`;
    const priceResp = await axios.get(priceUrl, { timeout: 3000 });
    const mp = priceResp.data?.market_price || {};
    const buyPrice = Number(mp.buy_price || 0.6);
    const amountMLCN = Number(amountKES) / buyPrice;
    logger.debug('processPayment', 'Price fetched', { buyPrice, amountMLCN });
  } catch (e) {
    logger.warn('processPayment', 'Could not fetch price from chain', { error: e.message });
  }

  const chainResp = await broadcastTx(normalizedTxBytes);
  const txHash = chainResp.tx_response?.txhash || chainResp.txhash;
  const code = chainResp.tx_response?.code || chainResp.code;

  if (code && code !== 0) {
    const errorLog = chainResp.tx_response?.raw_log || chainResp.raw_log;
    logger.warn('processPayment', 'Payment transaction failed', { code, txHash, errorLog });
    throw new AppError(
      ErrorCodes.INVALID_TRANSACTION,
      'Payment transaction failed',
      400,
      { code, txHash, errorLog }
    );
  }

  logger.info('processPayment', 'Payment broadcast confirmed', { txHash, buyerAddress, sellerAddress, amountKES });
  return res.json({
    success: true,
    txHash,
    buyer: buyerAddress,
    seller: sellerAddress,
    amountKES,
    description,
  });
};

/**
 * Get transaction status from blockchain
 * GET /api/send/status/:txHash
 */
exports.getTransactionStatus = async (req, res) => {
  const { txHash } = req.params;
  logger.info('getTransactionStatus', 'Fetching transaction status', { txHash });

  if (!txHash || txHash.length === 0) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Transaction hash required', 400, { field: 'txHash' });
  }

  const txUrl = `${CHAIN_REST}/cosmos/tx/v1beta1/txs/${txHash}`;

  try {
    const txResp = await axios.get(txUrl, { timeout: 3000 });
    const tx = txResp.data?.tx_response || {};
    const status = tx.code === 0 ? 'confirmed' : 'failed';

    return res.json({
      success: true,
      hash: txHash,
      height: tx.height,
      code: tx.code,
      status,
      gasUsed: tx.gas_used,
      gasWanted: tx.gas_wanted,
      timestamp: tx.timestamp,
    });
  } catch (e) {
    if (e.response?.status === 404) {
      logger.warn('getTransactionStatus', 'Transaction not found yet', { txHash });
      return res.json({
        success: false,
        hash: txHash,
        status: 'pending',
        message: 'Transaction not yet on chain',
      });
    }
    logger.error('getTransactionStatus', 'Failed to fetch tx status', e, { txHash });
    if (e.code === 'ECONNABORTED') {
      throw new AppError(ErrorCodes.RPC_TIMEOUT, 'Blockchain request timed out', 504, { txHash });
    }
    throw new AppError(ErrorCodes.RPC_ERROR, 'Failed to fetch transaction status', 503, { txHash, originalError: e.message });
  }
};

/**
 * Fetch account metadata (account_number and sequence) for signing
 * GET /api/send/account/:address
 */
exports.getAccountInfo = async (req, res) => {
  const { address } = req.params;
  logger.info('getAccountInfo', 'Fetching account metadata', { address });

  if (!address) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Address is required', 400, { field: 'address' });
  }

  const accountUrl = `${CHAIN_REST}/cosmos/auth/v1beta1/accounts/${address}`;
  const resp = await axios.get(accountUrl, { timeout: 5000, validateStatus: () => true });

  if (resp.status >= 400) {
    logger.warn('getAccountInfo', 'Account not found or unavailable', { address, status: resp.status });
    return res.json({
      success: true,
      accountNumber: 0,
      sequence: 0,
      pubkey: null,
      notFound: true,
    });
  }

  const account = resp.data?.account;
  if (!account) {
    return res.json({ success: true, accountNumber: 0, sequence: 0, pubkey: null, notFound: true });
  }

  const baseAccount = account.base_account || account;
  const accountNumber = Number(baseAccount.account_number ?? account.account_number);
  const sequence = Number(baseAccount.sequence ?? account.sequence);
  const pubkey = baseAccount.pub_key || account.pub_key || null;

  if (Number.isNaN(accountNumber) || Number.isNaN(sequence)) {
    logger.error('getAccountInfo', 'Failed to parse account metadata', { address, account });
    throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to parse account metadata from chain response', 500, { address });
  }

  return res.json({
    success: true,
    accountNumber,
    sequence,
    pubkey,
    notFound: false,
  });
};

/** GET /api/send/mlcns/balance/:address */
exports.getMlcnsBalance = async (req, res) => {
  try {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'invalid_address' });
    }
    const balance = await getWalletBalance(address);
    return res.json({ success: true, ...balance });
  } catch (err) {
    console.error('[MLCNS Balance]', err.message);
    return res.status(503).json({ error: 'balance_unavailable', message: err.message });
  }
};

/** GET /api/send/mlcns/price — live MLCNS/KES with activity momentum */
exports.getMlcnsPrice = async (req, res) => {
  try {
    const [price, emission, activity] = await Promise.all([
      getMarketPrice(),
      getActivityMetrics(),
      axios
        .get(`${CHAIN_REST}/tmp/marketplace/mlcoin/v1/market/price`, { timeout: 5000 })
        .then((r) => r.data)
        .catch(() => ({})),
    ]);
    const metrics = activity?.activity_metrics || activity || {};
    return res.json({
      success: true,
      symbol: 'MLCNS',
      basePriceKes: Number(process.env.MLCNS_BASE_PRICE_KES || 0.6),
      market: price,
      momentum: {
        engagementScore: metrics.engagement_score || activity?.engagement_score,
        priceImpactMultiplier: metrics.price_impact_multiplier,
        description:
          'More daily usage increases Mallcoin momentum and can lift the effective price.',
      },
      emission,
      raw: activity,
    });
  } catch (err) {
    return res.status(503).json({ error: 'price_unavailable', message: err.message });
  }
};

/**
 * POST /api/send/mlcns/transfer
 * Body: { from, to, amountMlcns, txBytes } — broadcast pre-signed tx
 *   OR { from, to, amountMlcns, privateKey } — dev/server sign (NODE_ENV !== production only)
 */
exports.transferMlcns = async (req, res) => {
  try {
    const { from, to, amountMlcns, txBytes, privateKey, memo } = req.body || {};

    if (!from || !to || amountMlcns === undefined) {
      return res.status(400).json({ error: 'from, to, and amountMlcns are required' });
    }
    if (!isValidAddress(from) || !isValidAddress(to)) {
      return res.status(400).json({ error: 'invalid_mall_address' });
    }
    if (from === to) {
      return res.status(400).json({ error: 'cannot_send_to_self' });
    }

    const amount = Number(amountMlcns);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'invalid_amount' });
    }

    const senderBal = await getWalletBalance(from);
    if (senderBal.availableDisplay < amount) {
      return res.status(400).json({
        error: 'insufficient_mlcns',
        available: senderBal.availableDisplay,
        requested: amount,
      });
    }

    if (txBytes) {
      req.body = { from, to, amount, txBytes };
      return exports.sendMallcoins(req, res);
    }

    if (privateKey) {
      // Disallow raw privateKey submission in production.
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Sending raw privateKey in request is forbidden in production.' });
      }
      // Require explicit opt-in in development to allow insecure privateKey payloads
      if (process.env.ALLOW_INSECURE_PRIVATE_KEY !== 'true') {
        return res.status(400).json({
          error: 'privateKey payloads are disallowed. Set ALLOW_INSECURE_PRIVATE_KEY=true in your local dev environment to enable (not recommended).',
        });
      }
      const result = await signAndBroadcastTransfer({
        privateKeyHex: privateKey,
        fromAddress: from,
        toAddress: to,
        amountMlcns: amount,
        memo: memo || '',
      });
      return res.json({
        success: true,
        txHash: result.txHash,
        from,
        to,
        amountMlcns: amount,
        denom: 'MLCNS',
        warning: 'Server-side signing is for development only (explicitly enabled)',
      });
    }

    return res.status(400).json({
      error: 'txBytes_required',
      message: 'Sign MsgTransferMallcoin in the wallet client and submit txBytes',
    });
  } catch (err) {
    console.error('[MLCNS Transfer]', err.message, err.rawLog || '');
    return res.status(500).json({
      error: 'transfer_failed',
      message: err.message,
      log: err.rawLog,
    });
  }
};

/** GET /api/send/gas-balance/:address — native stake for tx fees */
exports.getGasBalance = async (req, res) => {
  try {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'invalid_address' });
    }
    const denom = config.chain.baseDenom || 'stake';
    const { data } = await axios.get(
      `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
      { timeout: 5000 }
    );
    const coin = (data.balances || []).find((b) => b.denom === denom);
    const amount = coin ? BigInt(coin.amount) : 0n;
    const decimals = 6;
    const display = Number(amount) / 10 ** decimals;
    const minGas = Number(process.env.MIN_GAS_BALANCE || 0.05);
    return res.json({
      success: true,
      denom,
      displayDenom: config.chain.displayDenom || 'MAL',
      amount: amount.toString(),
      display,
      sufficient: display >= minGas,
      recommendedMin: minGas,
    });
  } catch (err) {
    return res.status(503).json({ error: 'gas_balance_unavailable', message: err.message });
  }
};

/** GET /api/send/mlcns/validate/:address */
exports.validateMlcnsRecipient = async (req, res) => {
  try {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      return res.json({ valid: false, reason: 'invalid_address_format' });
    }
    const bal = await getWalletBalance(address);
    return res.json({
      valid: true,
      exists: bal.exists,
      balance: bal.balanceDisplay,
      message: bal.exists
        ? 'Recipient has an MLCNS wallet on-chain'
        : 'New recipient — wallet will be created when they receive MLCNS',
    });
  } catch (err) {
    return res.status(503).json({ valid: false, error: err.message });
  }
};
