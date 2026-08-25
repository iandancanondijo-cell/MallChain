/* eslint-env node */
/* global require, module */
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate')
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing')
const { config } = require('../config')
const { createDexRegistry } = require('./dexProto')

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
  // Without a custom registry here, encoding any x/dex Msg throws
  // "Unregistered type url" the moment signAndBroadcast tries to serialize
  // it — @cosmjs/stargate's default registry only knows standard Cosmos
  // SDK message types. See dexProto.js.
  return SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createDexRegistry(),
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
  // 1.15x wasn't always enough margin over the simulated estimate — a real
  // MLCNS transfer failed "out of gas" at ~100% of the simulated value with
  // this same buffer (see mallcoinTxBuilder.js). Back to 1.3x.
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

async function removeLiquidityOnChain({ mnemonic, providerAddress, poolId, liquidityTokens, memo = '' }) {
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
  if (!liquidityTokens || !liquidityTokens.denom || !liquidityTokens.amount) {
    throw new Error('liquidityTokens must include denom and amount')
  }

  const client = await createSigningClient(mnemonic)
  const msg = {
    typeUrl: '/marketplace.dex.v1.MsgRemoveLiquidity',
    value: {
      provider: providerAddress,
      poolId: Number(poolId),
      liquidityTokens: {
        denom: liquidityTokens.denom,
        amount: liquidityTokens.amount.toString(),
      },
    },
  }

  const estimatedGas = await client.simulate(providerAddress, [msg], memo).catch(() => 250000)
  const gas = Math.min(Math.ceil(estimatedGas * 1.3), 800000)
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice))

  const result = await client.signAndBroadcast(providerAddress, [msg], fee, memo)
  if (result.code !== 0) {
    const err = new Error(result.rawLog || `Remove liquidity failed with code ${result.code}`)
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
  removeLiquidityOnChain,
}
