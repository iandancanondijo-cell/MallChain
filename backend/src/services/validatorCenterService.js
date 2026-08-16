const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const DEFAULT_PAGE_LIMIT = 100;

const STATUS_LABELS = {
  BOND_STATUS_BONDED: 'bonded',
  BOND_STATUS_UNBONDED: 'unbonded',
  BOND_STATUS_UNBONDING: 'unbonding',
};

function safeNumber(value) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return 0;
}

function normalizeCommission(commission) {
  const rate = safeNumber(commission?.commission_rates?.rate || commission?.rate || '0');
  return Math.round(rate * 10000) / 100;
}

function scoreFromPerformance(uptime, stakeShare, commission) {
  const uptimeScore = uptime;
  const stakeScore = Math.min(100, stakeShare * 100);
  const commissionScore = Math.max(0, 100 - commission);
  return Math.round((uptimeScore * 0.55) + (stakeScore * 0.25) + (commissionScore * 0.20));
}

function buildValidatorRecord(validator, signingInfo, totalBonded) {
  const operatorAddress = validator.operator_address || validator.operatorAddress;
  const tokens = safeNumber(validator.tokens || validator.tokens || '0');
  const commission = normalizeCommission(validator.commission || validator);
  const stakeShare = totalBonded > 0 ? tokens / totalBonded : 0;
  const missedBlocks = safeNumber(signingInfo?.missed_blocks_counter || 0);
  const uptime = Math.max(0, Math.min(100, 100 - Math.min(100, missedBlocks / 10)));
  const reputationScore = scoreFromPerformance(uptime, stakeShare, commission);

  return {
    operatorAddress,
    name: validator.description?.moniker || validator.description?.moniker || operatorAddress,
    identity: validator.description?.identity || '',
    website: validator.description?.website || '',
    details: validator.description?.details || '',
    commission: commission.toFixed(2),
    totalStaked: Math.round((tokens / 1e6) * 100) / 100,
    votingPower: tokens,
    status: STATUS_LABELS[validator.status] || validator.status || 'unknown',
    uptime,
    missedBlocks,
    jailed: validator.jailed || false,
    tokens,
    reputationScore,
    signingInfo: signingInfo || null,
  };
}

async function fetchTotalBonded() {
  try {
    const response = await axios.get(`${CHAIN_REST}/cosmos/staking/v1beta1/pool`, { timeout: 5000 });
    const bonded = response.data?.pool?.bonded_tokens || response.data?.pool?.bondedTokens || '0';
    return safeNumber(bonded);
  } catch (err) {
    return 0;
  }
}

async function fetchSigningInfos() {
  const results = {};
  try {
    const response = await axios.get(`${CHAIN_REST}/cosmos/slashing/v1beta1/signing_infos?pagination.limit=${DEFAULT_PAGE_LIMIT}`, { timeout: 5000 });
    const infos = response.data?.info || response.data?.signing_infos || [];
    infos.forEach((info) => {
      const address = info.address || info.validator_address || info.addresses;
      if (address) {
        results[address] = info;
      }
    });
  } catch (err) {
    // ignore; signing info is nice-to-have
  }
  return results;
}

async function fetchValidators() {
  const validators = [];
  try {
    const response = await axios.get(`${CHAIN_REST}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=${DEFAULT_PAGE_LIMIT}`, { timeout: 7000 });
    const list = response.data?.validators || response.data?.validator || [];
    list.forEach((validator) => validators.push(validator));
  } catch (err) {
    throw new Error(`Unable to load validators: ${err.message}`);
  }
  return validators;
}

async function getValidatorLeaderboard() {
  const [validators, signingInfos, totalBonded] = await Promise.all([
    fetchValidators(),
    fetchSigningInfos(),
    fetchTotalBonded(),
  ]);

  const records = validators.map((validator) => {
    const address = validator.operator_address || validator.operatorAddress;
    return buildValidatorRecord(validator, signingInfos[address], totalBonded);
  });

  return records.sort((a, b) => b.reputationScore - a.reputationScore || b.totalStaked - a.totalStaked);
}

/**
 * Direct single-validator lookup, regardless of bond status. The leaderboard
 * (getValidatorLeaderboard) only queries BOND_STATUS_BONDED — correct for a
 * "top validators" ranking, but it means a freshly self-bonded validator
 * that hasn't (or will never, given a small self-delegation) enter the
 * active bonded set would incorrectly read as "not found" everywhere that
 * only calls the leaderboard, e.g. the My Application page's on-chain check.
 */
async function fetchValidatorAnyStatus(operatorAddress) {
  try {
    const response = await axios.get(`${CHAIN_REST}/cosmos/staking/v1beta1/validators/${operatorAddress}`, { timeout: 5000 });
    return response.data?.validator || null;
  } catch (err) {
    return null;
  }
}

async function getValidatorDetail(operatorAddress) {
  const direct = await fetchValidatorAnyStatus(operatorAddress);
  if (direct) {
    const [signingInfos, totalBonded] = await Promise.all([fetchSigningInfos(), fetchTotalBonded()]);
    return buildValidatorRecord(direct, signingInfos[operatorAddress], totalBonded);
  }

  const leaderboard = await getValidatorLeaderboard();
  return leaderboard.find((validator) => validator.operatorAddress === operatorAddress) || null;
}

module.exports = {
  getValidatorLeaderboard,
  getValidatorDetail,
};
