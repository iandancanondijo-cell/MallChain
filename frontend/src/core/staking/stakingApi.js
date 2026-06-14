import { appConfig } from '../../config/app'
import {
  delegateStake,
  undelegateStake,
  claimAllRewards,
  claimRewards,
} from '../chain/cosmosTx'

const API = appConfig.apiUrl

export async function fetchValidators() {
  const res = await fetch(`${API}/validators/list`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load validators')
  return data
}

export async function fetchStakingSummary(address) {
  const res = await fetch(`${API}/staking/summary/${encodeURIComponent(address)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load staking summary')
  return data.summary
}

export async function stakeTokens({
  privateKeyHex,
  delegatorAddress,
  validatorAddress,
  amountDisplay,
}) {
  return delegateStake({
    privateKeyHex,
    delegatorAddress,
    validatorAddress,
    amountDisplay,
  })
}

export async function unstakeTokens({
  privateKeyHex,
  delegatorAddress,
  validatorAddress,
  amountDisplay,
}) {
  return undelegateStake({
    privateKeyHex,
    delegatorAddress,
    validatorAddress,
    amountDisplay,
  })
}

export async function claimStakingRewards({
  privateKeyHex,
  delegatorAddress,
  validatorAddresses,
}) {
  if (validatorAddresses.length === 1) {
    return claimRewards({
      privateKeyHex,
      delegatorAddress,
      validatorAddress: validatorAddresses[0],
    })
  }
  return claimAllRewards({
    privateKeyHex,
    delegatorAddress,
    validatorAddresses,
  })
}

export const displayDenom = appConfig.chain.displayDenom
