/**
 * Cosmos SDK transactions: governance votes and staking (client-side signing).
 */
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, GasPrice, calculateFee } from '@cosmjs/stargate'
import { appConfig, toBaseUnits } from '../../config/app'

const VOTE_OPTION = {
  yes: 1,
  abstain: 2,
  no: 3,
  veto: 4,
}

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

async function clientFromPrivateKey(privateKeyHex) {
  const wallet = await DirectSecp256k1Wallet.fromKey(
    hexToBytes(privateKeyHex),
    appConfig.chain.prefix
  )
  const [account] = await wallet.getAccounts()
  const signingClient = await SigningStargateClient.connectWithSigner(
    appConfig.chain.rpc,
    wallet,
    { gasPrice: gasPrice() }
  )
  return { signingClient, account }
}

async function signAndBroadcast(privateKeyHex, fromAddress, messages, memo = '') {
  const { signingClient, account } = await clientFromPrivateKey(privateKeyHex)
  if (account.address !== fromAddress) {
    throw new Error('Private key does not match wallet address')
  }

  const gasEst = await signingClient
    .simulate(account.address, messages, memo)
    .catch(() => 250000)
  const gas = Math.min(Math.ceil(gasEst * 1.3), 600000)
  const fee = calculateFee(gas, gasPrice())

  const result = await signingClient.signAndBroadcast(
    account.address,
    messages,
    fee,
    memo
  )

  if (result.code !== 0) {
    throw new Error(result.rawLog || `Transaction failed (code ${result.code})`)
  }

  return {
    txHash: result.transactionHash,
    height: result.height,
  }
}

/**
 * Cast a governance vote (cosmos.gov v1).
 */
export async function voteOnProposal({
  privateKeyHex,
  voterAddress,
  proposalId,
  option,
  memo = '',
}) {
  const voteOption = VOTE_OPTION[option]
  if (!voteOption) throw new Error(`Invalid vote option: ${option}`)

  const msg = {
    typeUrl: '/cosmos.gov.v1.MsgVote',
    value: {
      proposalId: BigInt(proposalId),
      voter: voterAddress,
      option: voteOption,
      metadata: '',
    },
  }

  return signAndBroadcast(privateKeyHex, voterAddress, [msg], memo || `vote ${option}`)
}

/**
 * Delegate stake to a validator.
 */
export async function delegateStake({
  privateKeyHex,
  delegatorAddress,
  validatorAddress,
  amountDisplay,
  memo = '',
}) {
  const denom = appConfig.chain.baseDenom
  const msg = {
    typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
    value: {
      delegatorAddress,
      validatorAddress,
      amount: { denom, amount: toBaseUnits(amountDisplay) },
    },
  }
  return signAndBroadcast(privateKeyHex, delegatorAddress, [msg], memo || 'delegate')
}

/**
 * Undelegate stake from a validator.
 */
export async function undelegateStake({
  privateKeyHex,
  delegatorAddress,
  validatorAddress,
  amountDisplay,
  memo = '',
}) {
  const denom = appConfig.chain.baseDenom
  const msg = {
    typeUrl: '/cosmos.staking.v1beta1.MsgUndelegate',
    value: {
      delegatorAddress,
      validatorAddress,
      amount: { denom, amount: toBaseUnits(amountDisplay) },
    },
  }
  return signAndBroadcast(privateKeyHex, delegatorAddress, [msg], memo || 'undelegate')
}

/**
 * Claim staking rewards from one validator.
 */
export async function claimRewards({
  privateKeyHex,
  delegatorAddress,
  validatorAddress,
  memo = '',
}) {
  const msg = {
    typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
    value: {
      delegatorAddress,
      validatorAddress,
    },
  }
  return signAndBroadcast(privateKeyHex, delegatorAddress, [msg], memo || 'claim rewards')
}

/**
 * Claim rewards from all validators with pending rewards.
 */
export async function claimAllRewards({
  privateKeyHex,
  delegatorAddress,
  validatorAddresses,
}) {
  const msgs = validatorAddresses.map((validatorAddress) => ({
    typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
    value: { delegatorAddress, validatorAddress },
  }))
  if (!msgs.length) throw new Error('No validators to claim from')
  return signAndBroadcast(privateKeyHex, delegatorAddress, msgs, 'claim all rewards')
}

export { VOTE_OPTION }
