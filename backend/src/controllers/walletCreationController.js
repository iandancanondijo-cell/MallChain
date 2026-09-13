const mallcoinService = require('../services/mallcoinService');
const MallPointAccount = require('../models/MallPointAccount');
const { getChainUserPoints, mergePoints } = require('../services/mallpointsService');

// createWallet/validateMnemonic/generateMnemonic used to live here, taking a
// plaintext mnemonic over the wire from an unauthenticated endpoint just to
// run a pure local crypto derivation the frontend could do (and now does)
// itself — see mallchain-os-v14/src/services/wallet.ts
// (deriveAddressFromMnemonic/generateNewMnemonic), which uses the exact same
// DirectSecp256k1HdWallet + "mall"-prefix derivation, so addresses match
// byte-for-byte. Removed entirely rather than just gated behind auth: a real
// user's seed phrase should never transit the network at all.

/**
 * GET /api/wallet/:address
 * Fetches wallet balance from blockchain
 */
async function getWalletBalance(req, res) {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    let mall = 0;
    let mallLocked = 0;
    let mallUnlockTime = null;
    try {
      const mlcns = await mallcoinService.getWalletBalance(address);
      mall = mlcns.availableDisplay || 0;
      mallLocked = mlcns.lockedDisplay || 0;
      mallUnlockTime = mlcns.unlockTime || null;
    } catch (chainErr) {
      console.warn('[Wallet Balance] MLCoin module unavailable, using fallback:', chainErr.message);
      return res.json({
        address,
        MALL: 0,
        MLPTS: 0,
        USD_M: 0,
        KES: 0,
        EUR: 0,
        GBP: 0,
        lastUpdated: Date.now(),
        note: 'Blockchain REST API unavailable'
      });
    }

    let mlpts = 0;
    try {
      const acc = await MallPointAccount.findOne({ address });
      const chain = await getChainUserPoints(address);
      mlpts = mergePoints({ chain, dbBalance: acc ? acc.balance : 0 }).balance;
    } catch (pointsErr) {
      console.warn('[Wallet Balance] Mallpoints lookup failed:', pointsErr.message);
    }

    res.json({
      address,
      MALL: mall,
      MALL_LOCKED: mallLocked,
      MALL_UNLOCK_TIME: mallUnlockTime,
      MLPTS: mlpts,
      USD_M: 0, // no USD-M stablecoin module on this chain
      KES: 0,
      EUR: 0,
      GBP: 0,
      lastUpdated: Date.now()
    });
  } catch (err) {
    console.error('[Wallet Balance] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch wallet balance', details: err.message });
  }
}

module.exports = {
  getWalletBalance
};
