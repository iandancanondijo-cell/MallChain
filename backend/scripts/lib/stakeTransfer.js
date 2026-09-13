/**
 * Shared "send stake and verify it actually landed" logic, used by both
 * scripts/fund-stake.js (generic, any sender -> any recipient) and
 * scripts/fund-treasury.js (a zero-argument wrapper specifically for
 * refilling the treasury). Kept in one place so the two scripts can't
 * silently drift into doing the verification differently.
 *
 * The post-send balance check deliberately makes its own plain HTTP request
 * to the chain's REST API rather than reusing the signing client's own
 * balance query — an independent check catches the case where the client
 * object itself is lying/stale, not just re-asking the same thing twice.
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { config } = require('../../src/config');

async function deriveAddress(mnemonic) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  return { wallet, address: account.address };
}

async function queryStakeBalance(address) {
  const rest = config.chain.rest.replace(/\/$/, '');
  const response = await fetch(`${rest}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=stake`);
  if (!response.ok) throw new Error(`Balance query failed with status ${response.status}`);
  const data = await response.json();
  return BigInt(data.balance?.amount || '0');
}

/**
 * Sends `amount` stake from the wallet derived from `fromMnemonic` to
 * `toAddress`, then independently re-queries the chain to confirm the
 * recipient's balance actually increased by that amount. Throws on any
 * failure — callers should let that propagate to a non-zero exit code
 * rather than print a misleading "success".
 */
async function sendStakeAndVerify({ fromMnemonic, toAddress, amount, memo }) {
  const { wallet, address: fromAddress } = await deriveAddress(fromMnemonic);

  const senderBalanceBefore = await queryStakeBalance(fromAddress);
  console.log(`Sender ${fromAddress} currently holds ${senderBalanceBefore}stake`);
  if (senderBalanceBefore <= BigInt(amount)) {
    throw new Error(
      `Sender balance (${senderBalanceBefore}stake) is not comfortably above the requested amount ` +
      `(${amount}stake) once its own gas fee is accounted for. Lower the amount or fund the sender first.`
    );
  }

  const recipientBalanceBefore = await queryStakeBalance(toAddress);

  console.log(`Sending ${amount}stake: ${fromAddress} -> ${toAddress}`);
  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
  });
  const result = await client.sendTokens(fromAddress, toAddress, [{ denom: 'stake', amount: String(amount) }], 'auto', memo);

  if (result.code && Number(result.code) !== 0) {
    throw new Error(`Transaction failed (code ${result.code}): ${result.rawLog || 'no raw_log'}`);
  }
  console.log(`Broadcast succeeded — txHash: ${result.transactionHash}  height: ${result.height}`);

  // Independent re-check against the chain itself, not the client we just
  // used to broadcast — this is the actual proof it landed, not just that
  // the broadcast call returned without error.
  const recipientBalanceAfter = await queryStakeBalance(toAddress);
  const actualIncrease = recipientBalanceAfter - recipientBalanceBefore;

  if (actualIncrease !== BigInt(amount)) {
    throw new Error(
      `Broadcast reported success but the recipient's balance only increased by ${actualIncrease}stake, ` +
      `not the expected ${amount}stake — investigate before trusting this transfer.`
    );
  }

  console.log(`Verified independently: ${toAddress} now holds ${recipientBalanceAfter}stake (+${actualIncrease})`);

  return {
    txHash: result.transactionHash,
    height: result.height,
    fromAddress,
    toAddress,
    recipientBalanceAfter: recipientBalanceAfter.toString(),
  };
}

module.exports = { sendStakeAndVerify, deriveAddress, queryStakeBalance };
