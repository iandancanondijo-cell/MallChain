/**
 * rewardMallcoins — on-chain MLCNS reward transfer.
 *
 * IMPLEMENTATION STATUS: stub — no on-chain transaction is sent.
 * Any call to this function will throw so callers fail loudly rather than
 * silently returning `true` while no funds move.
 *
 * TODO: replace the throw with a real MsgTransferMallcoin using the treasury
 * mnemonic (see mallcoinTxBuilder.transferFromMnemonic).
 */
module.exports = async function rewardMallcoins(_address, _amount) {
  throw new Error(
    'rewardMallcoins is not yet implemented. ' +
    'No on-chain transaction has been sent. ' +
    'Implement via mallcoinTxBuilder.transferFromMnemonic before enabling.'
  );
};
