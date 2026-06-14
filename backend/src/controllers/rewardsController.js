const axios = require('axios');
const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317';

exports.info = async (req, res) => {
  let { address } = req.params;
  const { mnemonic, publicKey } = req.body || {};
  try {
    if (!address || address.startsWith('0x')) {
      // Derive bech32 address from mnemonic or publicKey if provided
      if (mnemonic) {
        const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: PREFIX });
        const [account] = await wallet.getAccounts();
        address = account.address;
      } else if (publicKey) {
        const { RawSecp256k1Pubkey } = require('@cosmjs/amino');
        const { bech32 } = require('bech32');
        const bytes = Buffer.from(publicKey, 'hex');
        address = bech32.encode(PREFIX, bech32.toWords(bytes));
      } else if (address && address.startsWith('0x')) {
        // fallback: try hex to bech32 (may not be valid)
        const { bech32 } = require('bech32');
        const hex = address.replace(/^0x/, '');
        const bytes = Buffer.from(hex, 'hex');
        address = bech32.encode(PREFIX, bech32.toWords(bytes));
      } else {
        return res.status(400).json({ error: 'No valid address, mnemonic, or publicKey provided' });
      }
    }
    // Query rewards info from chain REST
    const url = `${CHAIN_REST}/cosmos/distribution/v1beta1/delegators/${address}/rewards`;
    const r = await axios.get(url, { timeout: 3000 }).catch(() => null);
    if (r) {
      res.json(r.data);
    } else {
      // Fallback: return empty rewards
      res.json({ rewards: [], total: [] });
    }
  } catch (e) {
    console.error('rewards info error:', e.message);
    // Return fallback response instead of 500
    res.json({ rewards: [], total: [] });
  }
};


const { getTreasuryMnemonic } = require('../utils/keyManager');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');
const RPC = process.env.RPC || process.env.CHAIN_RPC || 'http://127.0.0.1:26657';
const PREFIX = process.env.PREFIX || 'marketplace';

exports.claim = async (req, res) => {
  try {
    const { delegator, validator } = req.body;
    if (!delegator || !validator) return res.status(400).json({ error: 'Missing required fields' });
    const mnemonic = await getTreasuryMnemonic();
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: PREFIX });
    const [account] = await wallet.getAccounts();
    const client = await SigningStargateClient.connectWithSigner(RPC, wallet);
    const msg = {
      typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
      value: {
        delegatorAddress: delegator,
        validatorAddress: validator
      }
    };
    const fee = { amount: [{ denom: 'mlc', amount: '5000' }], gas: '120000' };
    const result = await client.signAndBroadcast(account.address, [msg], fee);
    res.json({ ok: true, tx: result });
  } catch (e) {
    res.status(500).json({ error: 'claim_failed', details: String(e) });
  }
};
