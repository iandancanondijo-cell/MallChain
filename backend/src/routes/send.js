const express = require('express');
const router = express.Router();
const sendCtrl = require('../controllers/sendController');
const { validate, schemas } = require('../middleware/validation');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize, validateQuery } = require('../middleware/inputValidation');
const { asyncHandler } = require('../utils/errorHandler');
const { createUserLimiter } = require('../middleware/rateLimiter');
const requireAuth = require('../middleware/requireAuth');
const { enforceReceiveIntent, settleReceiveIntent } = require('../middleware/receiveIntent');
const { blindIndex } = require('../utils/fieldEncryption');
const User = require('../models/user');
const Joi = require('joi');

// Keyed by the signing wallet address (from req.body.from), not just IP —
// these broadcast routes run with no auth middleware (client signs, backend
// just relays), so IP alone is bypassable by rotating source IPs against
// one wallet. Same budget as the old limiters.financial (20/15min).
const financialLimiter = createUserLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'rate_limit_exceeded', message: 'Too many financial operations. Please try again later.' } });

// Lighter rate limit for read-only GET endpoints (balance checks, tx status,
// price lookups). These don't move funds but can be used for enumeration or
// probing, so they still need a ceiling per IP.
const readLimiter = createUserLimiter({ windowMs: 5 * 60 * 1000, max: 60, message: { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' } });

/**
 * Wallet-authorization middleware for the broadcast relays.
 *
 * Two ways to be authorized to relay a transaction whose `from` is X:
 *  1. X is the wallet linked to the authenticated account (POST
 *     /api/auth/link-wallet, ADR-036 signature-verified) — the fast path.
 *  2. The request carries txBytes whose signature provably comes from the
 *     key that derives X. The relay cannot move X's funds without X's
 *     signature (the chain rejects unsigned/mismatched txs at CheckTx), so
 *     this is real authorization, not a bypass — and it's what lets one
 *     account transact across multiple wallets it holds the keys to without
 *     re-linking on every switch.
 *
 * A pre-signed tx for a *stranger's* wallet still fails: only the key
 * holder can produce txBytes that pass chain signature verification, and we
 * additionally require the claimed `from` to equal a signer address derived
 * from the tx's own pubkey, so relay logs/ledger rows can't be mislabeled.
 *
 * `addressField` picks which body param holds the sender address
 * (defaults to 'from'; /payment uses 'buyerAddress').
 */
function requireWalletOwnership(addressField = 'from') {
  return async function walletOwnershipMiddleware(req, res, next) {
    try {
      const body = req.validatedBody || req.body;
      const walletAddress = body[addressField];

      if (!walletAddress) {
        return res.status(400).json({ error: 'missing_wallet_address', message: `${addressField} is required` });
      }

      // Path 1: linked wallet. walletAddress is encrypted at rest, so query
      // by its blind index.
      const walletOwner = await User.findOne({ walletAddress_blind: blindIndex(walletAddress) }).select('_id').lean();
      if (walletOwner && walletOwner._id.toString() === req.user._id.toString()) return next();

      // Path 2: signed-tx proof. Decode txBytes, derive each secp256k1
      // signer address, and require one to equal the claimed `from`.
      const txBytes = body.txBytes;
      if (txBytes && (typeof txBytes === 'string' || Array.isArray(txBytes))) {
        try {
          const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
          const raw = typeof txBytes === 'string' ? Buffer.from(txBytes, 'base64') : Buffer.from(txBytes);
          const txRaw = TxRaw.decode(raw);
          const signerB64 = extractSignerPubkeys(txRaw);
          if (signerB64.length) {
            const { config } = require('../config');
            const { signerAddressesFromPubkeys } = require('../mallwallet/security/verifyAdr036');
            const addresses = signerAddressesFromPubkeys(signerB64, config.chain.prefix || 'mall');
            if (addresses.includes(walletAddress)) return next();
          }
        } catch (_) {
          // Unparseable txBytes — fall through to the rejection below.
        }
      }

      if (walletOwner) {
        return res.status(403).json({ error: 'wallet_ownership_mismatch', message: 'This wallet belongs to a different account, and the transaction signature does not match the claimed sender' });
      }
      return res.status(403).json({ error: 'wallet_not_linked', message: 'This wallet address is not linked to your account and the transaction was not signed by its key' });
    } catch (err) {
      return res.status(500).json({ error: 'ownership_check_failed', message: 'Could not verify wallet ownership' });
    }
  };
}

/**
 * Pull the base64 pubkeys from authInfoBytes.signer_infos without dragging
 * the full registry: authInfo is a plain protobuf message (cosmjs-types),
 * and every Mallchain client-signed tx carries a single direct-signer
 * secp256k1 pubkey.
 */
function extractSignerPubkeys(txRaw) {
  const { AuthInfo } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
  const auth = AuthInfo.decode(txRaw.authInfoBytes);
  const out = [];
  for (const si of auth.signerInfos || []) {
    const pk = si.publicKey;
    if (pk && /secp256k1\.PubKey$/.test(pk.typeUrl || '') && pk.value) {
      // cosmjs encodePubkey wraps the 33-byte compressed key in an amino
      // Key envelope: 0x0a 0x21 <33 bytes> (35 bytes total). Unwrap it so
      // both the bare and enveloped forms reach address derivation.
      let bytes = Buffer.from(pk.value);
      if (bytes.length === 35 && bytes[0] === 0x0a && bytes[1] === 0x21) bytes = bytes.subarray(2);
      if (bytes.length === 33) out.push(bytes.toString('base64'));
    }
  }
  return out;
}

// Task 8.6: Apply input validation to send routes to prevent NoSQL injection and XSS
// Query parameter validation schemas
const txHashQuerySchema = Joi.object({
  txHash: Joi.string()
    .hex()
    .uppercase()
    .max(64)
    .required()
    .messages({
      'string.hex': 'Transaction hash must be hexadecimal',
      'string.max': 'Transaction hash exceeds maximum length',
    }),
});

const addressParamSchema = Joi.object({
  address: Joi.string()
    .pattern(/^mall1[a-z0-9]{38,58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid Mallchain address format',
    }),
});

// Send mallcoins from one wallet to another
router.post('/mallcoins',
  requireAuth(),
  requireWalletOwnership('from'),
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.transfer),
  enforceReceiveIntent,
  settleReceiveIntent,
  asyncHandler(sendCtrl.sendMallcoins)
);

// Pay for something using mallcoins
router.post('/payment',
  requireAuth(),
  requireWalletOwnership('buyerAddress'),
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.mallcoinPayment),
  asyncHandler(sendCtrl.processPayment)
);

// Get transaction status
router.get('/status/:txHash', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getTransactionStatus)
);

// Get account metadata (account number / sequence) for signing
router.get('/account/:address', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getAccountInfo)
);

// Mallcoin (MLCNS) wallet-to-wallet
router.get('/gas-balance/:address', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getGasBalance)
);

router.get('/mlcns/balance/:address', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getMlcnsBalance)
);

router.get('/mlcns/price', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.getMlcnsPrice)
);

router.get('/mlcns/validate/:address', 
  readLimiter,
  preventNoSQLInjection,
  asyncHandler(sendCtrl.validateMlcnsRecipient)
);

router.post('/mlcns/transfer',
  requireAuth(),
  requireWalletOwnership('from'),
  financialLimiter,
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  validate(schemas.mlcnsTransfer),
  enforceReceiveIntent,
  settleReceiveIntent,
  asyncHandler(sendCtrl.transferMlcns)
);

/**
 * POST /api/send/simulate
 * Accepts unsigned transaction bytes and returns gas estimate from chain simulation.
 * Used by frontend client-signed transactions to get dynamic gas estimation instead of hardcoded values.
 */
router.post('/simulate',
  readLimiter,
  limitPayloadSize(1),
  preventNoSQLInjection,
  asyncHandler(async (req, res) => {
    const { txBytes } = req.body || {};
    if (!txBytes || typeof txBytes !== 'string') {
      return res.status(400).json({ success: false, error: 'tx_bytes_required', message: 'Transaction bytes are required' });
    }

    const axios = require('axios');
    const { CHAIN_REST } = require('../utils/cosmosClient');
    const simulateUrl = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/simulate`;

    try {
      const r = await axios.post(
        simulateUrl,
        { tx_bytes: txBytes },
        { timeout: 10000 }
      );

      const gasInfo = r.data?.gas_info;
      if (!gasInfo || !gasInfo.gas_used) {
        return res.status(400).json({
          success: false,
          error: 'simulation_failed',
          message: r.data?.error || 'Chain simulation did not return gas usage'
        });
      }

      return res.json({
        success: true,
        gasUsed: parseInt(gasInfo.gas_used, 10),
        gasWanted: gasInfo.gas_wanted ? parseInt(gasInfo.gas_wanted, 10) : undefined
      });
    } catch (err) {
      if (err.response?.data) {
        return res.status(400).json({
          success: false,
          error: 'simulation_failed',
          message: err.response.data.error || err.response.data.message || 'Chain simulation rejected the transaction'
        });
      }
      return res.status(503).json({
        success: false,
        error: 'chain_unreachable',
        message: 'Could not reach the chain simulation endpoint'
      });
    }
  })
);

module.exports = router;
