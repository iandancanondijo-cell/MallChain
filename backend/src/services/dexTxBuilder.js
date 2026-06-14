/* eslint-env node */
/* global require, module */
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate')
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing')
const { config } = require('../config')

function toBaseUnits(amount, decimals = 6) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid amount for base unit conversion')
  }
  const factor = 10 ** decimals
  return Math.round(value * factor).toString()
}

async function walletFromMnemonic(mnemonic) {
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new Error('Mnemonic is required to sign transactions')
  }

  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  })
}

async function getAddressFromMnemonic(mnemonic) {
  const wallet = await walletFromMnemonic(mnemonic)
  const [account] = await wallet.getAccounts()
  return account.address
}

async function createSigningClient(mnemonic) {
  const wallet = await walletFromMnemonic(mnemonic)
  return SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
  })
}

async function addLiquidityOnChain({ mnemonic, providerAddress, poolId, tokenA, tokenB, memo = '' }) {
  if (!mnemonic) {
    throw new Error('Missing mnemonic for liquidity provider')
  }
  if (!poolId) {
    throw new Error('Missing poolId')
  }

  const signerAddress = await getAddressFromMnemonic(mnemonic)
  if (providerAddress && signerAddress !== providerAddress) {
    throw new Error('Provider mnemonic does not match provider address')
  }
  providerAddress = providerAddress || signerAddress
  if (!tokenA || !tokenA.denom || !tokenA.amount) {
    throw new Error('tokenA must include denom and amount')
  }
  if (!tokenB || !tokenB.denom || !tokenB.amount) {
    throw new Error('tokenB must include denom and amount')
  }

  const client = await createSigningClient(mnemonic)
  const msg = {
    typeUrl: '/marketplace.dex.v1.MsgAddLiquidity',
    value: {
      provider: providerAddress,
      poolId: Number(poolId),
      tokenAAmount: {
        denom: tokenA.denom,
        amount: tokenA.amount.toString(),
      },
      tokenBAmount: {
        denom: tokenB.denom,
        amount: tokenB.amount.toString(),
      },
    },
  }

  const estimatedGas = await client.simulate(providerAddress, [msg], memo).catch(() => 250000)
  const gas = Math.min(Math.ceil(estimatedGas * 1.3), 800000)
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice))

  const result = await client.signAndBroadcast(providerAddress, [msg], fee, memo)
  if (result.code !== 0) {
    const err = new Error(result.rawLog || `Add liquidity failed with code ${result.code}`)
    err.code = result.code
    err.rawLog = result.rawLog
    throw err
  }

  return {
    success: true,
    txHash: result.transactionHash,
    height: result.height,
    gasUsed: result.gasUsed,
    events: result.events,
    raw: result,
  }
}

module.exports = {
  toBaseUnits,
  getAddressFromMnemonic,
  addLiquidityOnChain,
}
