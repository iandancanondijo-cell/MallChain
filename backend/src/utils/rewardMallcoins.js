/**
 * rewardMallcoins — on-chain MLCNS reward transfer, signed by the treasury
 * mnemonic (Vault-backed in production, TEST_MODE env fallback locally —
 * see utils/keyManager.getTreasuryMnemonic).
 */
const { getTreasuryMnemonic } = require('./keyManager');
const { transferFromMnemonic } = require('../services/mallcoinTxBuilder');

module.exports = async function rewardMallcoins(address, amount) {
  const amountMlcns = Number(amount);
  if (!address || typeof address !== 'string') {
    throw new Error('rewardMallcoins: address is required');
  }
  if (!Number.isFinite(amountMlcns) || amountMlcns <= 0) {
    throw new Error('rewardMallcoins: amount must be a positive number');
  }

  const mnemonic = await getTreasuryMnemonic();
  return transferFromMnemonic({
    mnemonic,
    toAddress: address,
    amountMlcns,
    memo: 'Mallcoin reward',
  });
};
