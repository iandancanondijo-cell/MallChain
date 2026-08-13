const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, StargateClient } = require('@cosmjs/stargate');
const bip39 = require('bip39');

const CHAIN_RPC = process.env.CHAIN_RPC_URL || 'http://localhost:26657';
const CHAIN_REST = process.env.CHAIN_REST_URL || 'http://localhost:1317';
const CHAIN_ID = process.env.CHAIN_ID || 'mallchain-1';

/**
 * POST /api/wallet/create
 * Creates a new wallet from mnemonic and optionally funds it from faucet
 */
async function createWallet(req, res) {
  try {
    const { mnemonic, userId } = req.body;

    if (!mnemonic) {
      return res.status(400).json({ error: 'Mnemonic is required' });
    }

    // Generate wallet from mnemonic
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'mall'
    });

    const [firstAccount] = await wallet.getAccounts();
    const address = firstAccount.address;

    // Create signing client to interact with blockchain
    const signingClient = await SigningStargateClient.connectWithSigner(
      CHAIN_RPC,
      wallet
    );

    res.json({
      success: true,
      address,
      accountId: firstAccount.address,
      chainId: CHAIN_ID
    });
  } catch (err) {
    console.error('[Wallet Creation] Error:', err.message);
    res.status(500).json({ error: 'Failed to create wallet', details: err.message });
  }
}

/**
 * POST /api/wallet/validate
 * Validates a mnemonic phrase
 */
async function validateMnemonic(req, res) {
  try {
    const { mnemonic } = req.body;

    if (!mnemonic) {
      return res.status(400).json({ error: 'Mnemonic is required' });
    }

    // Try to create wallet from mnemonic to validate
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'mall'
    });

    const [firstAccount] = await wallet.getAccounts();

    res.json({
      valid: true,
      address: firstAccount.address
    });
  } catch (err) {
    res.status(400).json({ 
      valid: false, 
      error: 'Invalid mnemonic phrase' 
    });
  }
}

/**
 * POST /api/wallet/generate-mnemonic
 * Generates a new BIP39 mnemonic phrase (24 words for enhanced security)
 */
async function generateMnemonic(req, res) {
  try {
    // Generate 24-word mnemonic (256 bits) for enhanced security
    const mnemonic = bip39.generateMnemonic(256);
    res.json({
      success: true,
      mnemonic
    });
  } catch (err) {
    console.error('[Wallet Creation] Error generating mnemonic:', err.message);
    res.status(500).json({ error: 'Failed to generate mnemonic', details: err.message });
  }
}

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

    // Try to connect to blockchain REST API
    let client;
    let balance;
    
    try {
      client = await StargateClient.connect(CHAIN_REST);
      // Query balance (default denom is umall for mallchain)
      balance = await client.getBalance(address, 'umall');
    } catch (chainErr) {
      console.warn('[Wallet Balance] Blockchain REST API unavailable, using fallback:', chainErr.message);
      // Return zero balance if blockchain is unavailable
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

    res.json({
      address,
      MALL: parseFloat(balance.amount) / 1_000_000, // Convert from umall to MALL (6 decimals)
      MLPTS: 0, // Mallpoints would need separate query
      USD_M: 0, // USD-M would need separate query
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
  createWallet,
  validateMnemonic,
  generateMnemonic,
  getWalletBalance
};
