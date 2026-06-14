const axios = require('axios');
const bip39 = require('bip39');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');

const CHAIN_REST = (process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317').replace(/\/$/, '');

/**
 * Validate Cosmos wallet address format
 * Cosmos addresses start with a prefix like "cosmos", "mall", etc and are 42 chars total
 */
function isValidCosmosAddress(address) {
  return /^(cosmos|mall|tmp)[a-z0-9]{39,}$/.test(address);
}

/**
 * Validate seed phrase format (12 or 24 words)
 */
function isValidSeedPhrase(mnemonic) {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive Cosmos wallet address from seed phrase
 */
async function deriveAddressFromSeedPhrase(mnemonic, addressPrefix = 'cosmos') {
  try {
    // Validate mnemonic
    if (!isValidSeedPhrase(mnemonic)) {
      throw new Error('Invalid seed phrase');
    }

    // Create wallet from mnemonic
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
      mnemonic.trim(),
      { prefix: addressPrefix }
    );

    // Get first account
    const accounts = await wallet.getAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts derived from seed phrase');
    }

    return {
      address: accounts[0].address,
      pubkey: accounts[0].pubkey,
    };
  } catch (error) {
    throw new Error(`Failed to derive address from seed phrase: ${error.message}`);
  }
}

/**
 * Connect to a wallet by validating it exists on blockchain and fetching balance
 */
async function connectWallet(req, res) {
  try {
    let { address, method, seedPhrase, addressPrefix } = req.body;
    // method: 'address', 'privateKey', 'seedPhrase'

    // Determine prefix from address or use default
    if (!addressPrefix) {
      if (address?.startsWith('mall')) addressPrefix = 'mall';
      else if (address?.startsWith('tmp')) addressPrefix = 'tmp';
      else addressPrefix = 'cosmos';
    }

    // Only address-based wallet connection is permitted for security.
    if (method === 'seedPhrase' || method === 'privateKey') {
      return res.status(400).json({
        error: 'Wallet connect API accepts only an address. Derive the address locally in the browser and do not send seed phrases or private keys to the server.'
      });
    }

    // Validate address is provided
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Validate address format
    if (!isValidCosmosAddress(address)) {
      return res.status(400).json({ 
        error: 'Invalid wallet address format. Must start with cosmos, mall, or tmp and be a valid Cosmos address.'
      });
    }

    // Query blockchain for account balance
    const balanceUrl = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`;
    const accountUrl = `${CHAIN_REST}/cosmos/auth/v1beta1/accounts/${address}`;

    try {
      const [balanceResp, accountResp] = await Promise.all([
        axios.get(balanceUrl, { timeout: 5000 }).catch(e => ({ data: { balances: [] } })),
        axios.get(accountUrl, { timeout: 5000 }).catch(e => ({ data: {} }))
      ]);

      const balances = balanceResp.data?.balances || [];
      const account = accountResp.data?.account;

      // Parse balances
      let mallcoins = 0;
      let umal = 0; // microMAL

      balances.forEach(bal => {
        if (bal.denom === 'umlcn' || bal.denom === 'mlcn') {
          mallcoins = parseInt(bal.amount) / 1000000; // Convert from microunits
        }
        if (bal.denom === 'umal' || bal.denom === 'mal') {
          umal = parseInt(bal.amount);
        }
      });

      // Return connected wallet info
      res.json({
        success: true,
        address,
        method,
        balance: {
          mallcoins: Math.floor(mallcoins),
          umal: umal,
          mallpoints: 0, // Fetch from custom module if available
          currency: 'KES',
          convertedBalance: Math.floor(umal / 100000), // Rough conversion to KES
        },
        account: account ? {
          accountNumber: account.account_number,
          sequence: account.sequence,
        } : null,
        timestamp: new Date().toISOString(),
      });

    } catch (blockchainErr) {
      console.error('Blockchain query error:', blockchainErr.message);
      // Wallet address might be valid but doesn't have balance yet
      res.json({
        success: true,
        address,
        method,
        balance: {
          mallcoins: 0,
          umal: 0,
          mallpoints: 0,
          currency: 'KES',
          convertedBalance: 0,
        },
        account: null,
        warning: 'Wallet found but has no balance yet',
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({ 
      error: 'Failed to connect wallet',
      details: error.message 
    });
  }
}

/**
 * Validate a wallet address without fully connecting
 */
async function validateAddress(req, res) {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ valid: false, error: 'Address is required' });
    }

    const isValid = isValidCosmosAddress(address);

    if (!isValid) {
      return res.json({ 
        valid: false, 
        error: 'Invalid address format' 
      });
    }

    // Try to fetch from blockchain
    try {
      const balanceUrl = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`;
      await axios.get(balanceUrl, { timeout: 5000 });
      res.json({ valid: true, exists: true });
    } catch (err) {
      // Address format is valid but doesn't exist on blockchain yet
      res.json({ valid: true, exists: false });
    }

  } catch (error) {
    console.error('Address validation error:', error);
    res.status(500).json({ 
      valid: false,
      error: 'Validation failed',
      details: error.message 
    });
  }
}

/**
 * Get wallet balance
 */
async function getWalletBalance(req, res) {
  try {
    const { address } = req.params;

    if (!isValidCosmosAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const balanceUrl = `${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}`;
    const response = await axios.get(balanceUrl, { timeout: 5000 });

    const balances = response.data?.balances || [];
    let mallcoins = 0;
    let umal = 0;

    balances.forEach(bal => {
      if (bal.denom === 'umlcn' || bal.denom === 'mlcn') {
        mallcoins = parseInt(bal.amount) / 1000000;
      }
      if (bal.denom === 'umal' || bal.denom === 'mal') {
        umal = parseInt(bal.amount);
      }
    });

    res.json({
      address,
      balance: {
        mallcoins: Math.floor(mallcoins),
        umal: umal,
        mallpoints: 0,
        currency: 'KES',
        convertedBalance: Math.floor(umal / 100000),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch balance',
      details: error.message 
    });
  }
}

module.exports = {
  connectWallet,
  validateAddress,
  getWalletBalance,
  isValidCosmosAddress,
};
