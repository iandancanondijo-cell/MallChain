const axios = require('axios');
const { config } = require('../config');
const CHAIN_REST = process.env.CHAIN_REST || 'http://127.0.0.1:1317';
const PREFIX = config.chain.prefix;

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
        // A Cosmos address is RIPEMD160(SHA256(pubkey)), not the raw pubkey
        // bytes — pubkeyToAddress does that derivation correctly (the old
        // code here bech32-encoded the raw pubkey bytes directly, producing
        // a well-formed-looking but cryptographically meaningless address).
        const { pubkeyToAddress, pubkeyType } = require('@cosmjs/amino');
        const bytes = Buffer.from(publicKey, 'hex');
        address = pubkeyToAddress(
          { type: pubkeyType.secp256k1, value: bytes.toString('base64') },
          PREFIX
        );
      } else if (address && address.startsWith('0x')) {
        // fallback: hex-encoded 20-byte address payload -> bech32 (matches
        // routes/addressMap.js's hex<->bech32 mapping convention)
        const bech32 = require('bech32');
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

// Reward claims (MsgWithdrawDelegatorReward) are now client-signed and
// broadcast through the generic /api/staking/broadcast relay, the same
// pattern used by governance/delegate txs. This endpoint used to sign with
// the treasury key while claiming an arbitrary caller-supplied delegator/
// validator address — broken (the chain requires the tx signer to match
// msg.delegatorAddress, so the treasury signature would never match a
// caller-supplied delegator) and insecure (any authed user could invoke it
// for any address, triggering a treasury-signed broadcast). Removed rather
// than fixed in place, since this platform holds no custodial keys for
// regular users — only the delegator's own wallet can legitimately sign
// their reward withdrawal.
