/**
 * Client-side Mallcoin (MLCNS) transfers using MsgTransferMallcoin.
 */
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, GasPrice, calculateFee } from '@cosmjs/stargate'
import { appConfig, fromBaseUnits } from '../../config/app'
import { mlcnsToBaseUnits } from '../../config/tokens'

const MSG_TRANSFER_MALLCOIN = '/marketplace.mlcoin.v1.MsgTransferMallcoin'

function hexToBytes(hex) {
  const h = hex.replace(/^0x/, '')
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function gasPrice() {
  return GasPrice.fromString(
    import.meta.env.VITE_GAS_PRICE || `0.01${appConfig.chain.baseDenom}`
  )
}

async function walletFromPrivateKey(privateKeyHex) {
  return DirectSecp256k1Wallet.fromKey(hexToBytes(privateKeyHex), appConfig.chain.prefix)
}

async function connectClient(privateKeyHex) {
  const wallet = await walletFromPrivateKey(privateKeyHex)
  const [account] = await wallet.getAccounts()
  const client = await SigningStargateClient.connectWithSigner(appConfig.chain.rpc, wallet, {
    gasPrice: gasPrice(),
  })
  return { client, account }
}

function buildTransferMsg(fromAddress, toAddress, amountMlcns) {
  return {
    typeUrl: MSG_TRANSFER_MALLCOIN,
    value: {
      creator: fromAddress,
      to: toAddress,
      amount: mlcnsToBaseUnits(amountMlcns),
    },
  }
}

/**
 * Simulate gas for MsgTransferMallcoin (fee is paid in native stake, not MLCNS).
 */
export async function estimateMlcnsTransfer({
  privateKeyHex,
  fromAddress,
  toAddress,
  amountMlcns,
  memo = '',
}) {
  const { client, account } = await connectClient(privateKeyHex)
  if (account.address !== fromAddress) {
    throw new Error('Wallet key does not match sender address')
  }

  const msg = buildTransferMsg(fromAddress, toAddress, amountMlcns)
  const gasEst = await client.simulate(account.address, [msg], memo).catch(() => 250000)
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000)
  const fee = calculateFee(gas, gasPrice())
  const feeCoin = fee.amount[0]
  const feeDisplay = fromBaseUnits(feeCoin.amount)

  return {
    gas,
    feeAmount: feeCoin.amount,
    feeDenom: feeCoin.denom,
    feeDisplay,
    feeDisplayDenom: appConfig.chain.displayDenom,
  }
}

/**
 * Transfer MLCNS wallet-to-wallet on-chain.
 * @param {Object} params
 * @param {string} params.privateKeyHex
 * @param {string} params.fromAddress
 * @param {string} params.toAddress
 * @param {number|string} params.amountMlcns - human amount (e.g. 10.5 MLCNS)
 * @param {string} [params.memo]
 */
export async function transferMlcns({
  privateKeyHex,
  fromAddress,
  toAddress,
  amountMlcns,
  memo = '',
}) {
  const { client, account } = await connectClient(privateKeyHex)
  if (account.address !== fromAddress) {
    throw new Error('Wallet key does not match sender address')
  }

  const msg = buildTransferMsg(fromAddress, toAddress, amountMlcns)
  const gasEst = await client.simulate(account.address, [msg], memo).catch(() => 250000)
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000)
  const fee = calculateFee(gas, gasPrice())
  const result = await client.signAndBroadcast(account.address, [msg], fee, memo)

  if (result.code !== 0) {
    throw new Error(result.rawLog || `Transfer failed (code ${result.code})`)
  }

  return {
    txHash: result.transactionHash,
    height: result.height,
    success: true,
  }
}
