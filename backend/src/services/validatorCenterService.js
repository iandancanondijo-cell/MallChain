const axios = require('axios');
// Plain Node crypto, not @cosmjs/crypto — that package's argon2 support
// drags in an ESM-only transitive dependency Jest's CJS resolver can't
// parse (same issue documented in other test files this session). A
// SHA-256 truncation doesn't need a Cosmos-specific library.
const crypto = require('crypto');
const { bech32 } = require('bech32');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const DEFAULT_PAGE_LIMIT = 100;

/**
 * A validator's operator_address (mallvaloper1...) and its
 * /cosmos/slashing signing_infos entry (keyed by consensus address,
 * mallvalcons1...) are two different addresses derived from two different
 * keys — looking one up by the other silently misses every time. Derives
 * the real mallvalcons address from the validator's ed25519 consensus_pubkey
 * using Tendermint's address spec — SHA256(pubkey)[:20], NOT the
 * RIPEMD160(SHA256(...)) "hash160" scheme secp256k1 account addresses use.
 * Verified against this chain's live signing_infos output (byte-for-byte
 * match) before trusting the formula.
 */
function consensusAddressFromPubkey(pubkeyBase64) {
  try {
    const pubkeyBytes = Buffer.from(pubkeyBase64, 'base64');
    const hash = crypto.createHash('sha256').update(pubkeyBytes).digest().slice(0, 20);
    return bech32.encode(`${config.chain.prefix}valcons`, bech32.toWords(hash));
  } catch (err) {
    return null;
  }
}

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

/**
 * uptime is null (not 0, and not a flattering 100) when the chain gave us no
 * signing record for this validator. Two different reasons can produce that —
 * the /cosmos/slashing query failing outright, or this particular validator
 * having no entry in it — and neither means "missed nothing", which is exactly
 * what a defaulted missed_blocks_counter of 0 reads as on a scoreboard.
 */
function scoreFromPerformance(uptime, stakeShare, commission) {
  const stakeScore = Math.min(100, stakeShare * 100);
  const commissionScore = Math.max(0, 100 - commission);
  if (uptime === null) {
    // Same weighting, over the two terms that are actually known (0.55 of the
    // score is re-spread across stake and commission rather than dropped).
    return Math.round((stakeScore * (0.25 / 0.45)) + (commissionScore * (0.20 / 0.45)));
  }
  return Math.round((uptime * 0.55) + (stakeScore * 0.25) + (commissionScore * 0.20));
}

function buildValidatorRecord(validator, signingInfo, totalBonded) {
  const operatorAddress = validator.operator_address || validator.operatorAddress;
  const tokens = safeNumber(validator.tokens || validator.tokens || '0');
  const commission = normalizeCommission(validator.commission || validator);
  const stakeShare = totalBonded > 0 ? tokens / totalBonded : 0;
  const uptimeKnown = Boolean(signingInfo);
  const missedBlocks = uptimeKnown ? safeNumber(signingInfo.missed_blocks_counter) : null;
  const uptime = uptimeKnown
    ? Math.max(0, Math.min(100, 100 - Math.min(100, missedBlocks / 10)))
    : null;
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
    // Says which terms went into reputationScore, so a reader told they are
    // "ranked by uptime, stake share & commission" can see when uptime was
    // missing from that ranking instead of assuming it was perfect.
    reputationBasis: uptimeKnown ? 'uptime + stake share + commission' : 'stake share + commission (no signing record)',
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

/**
 * Standard Cosmos SDK APR approximation (inflation / bonded ratio) — the
 * same formula block explorers (Mintscan, Keplr) use. Real, not hardcoded:
 * driven by the chain's actual current inflation and bonded-token ratio.
 */
async function fetchEstimatedApr() {
  try {
    const [inflationRes, supplyRes, poolRes] = await Promise.all([
      axios.get(`${CHAIN_REST}/cosmos/mint/v1beta1/inflation`, { timeout: 5000 }),
      axios.get(`${CHAIN_REST}/cosmos/bank/v1beta1/supply/by_denom?denom=${config.chain.baseDenom}`, { timeout: 5000 }),
      axios.get(`${CHAIN_REST}/cosmos/staking/v1beta1/pool`, { timeout: 5000 }),
    ]);
    const inflation = safeNumber(inflationRes.data?.inflation);
    const totalSupply = safeNumber(supplyRes.data?.amount?.amount);
    const bonded = safeNumber(poolRes.data?.pool?.bonded_tokens);
    if (!inflation || !totalSupply || !bonded) return null;
    const bondedRatio = bonded / totalSupply;
    if (bondedRatio <= 0) return null;
    return Math.round((inflation / bondedRatio) * 10000) / 100; // percent, 2dp
  } catch (err) {
    return null; // Caller falls back to omitting the field rather than a fake number.
  }
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
    // signing_infos is keyed by consensus address (mallvalcons1...), not
    // operator_address (mallvaloper1...) — see consensusAddressFromPubkey's
    // doc comment. Looking it up by operator_address always missed, so
    // missedBlocks silently defaulted to 0 (i.e. every validator showed a
    // fake 100% uptime) regardless of its real signing record.
    const consAddress = consensusAddressFromPubkey(validator.consensus_pubkey?.key);
    return buildValidatorRecord(validator, consAddress ? signingInfos[consAddress] : null, totalBonded);
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
    // Same keying rule getValidatorLeaderboard documents: signing_infos is
    // addressed by consensus address, so this used to look up
    // signingInfos[operatorAddress] — a mallvaloper1... key that can never be
    // present — and hand buildValidatorRecord `undefined` for every validator
    // detail read. With the uptime term now null rather than a defaulted 100,
    // a missed lookup is at least visible instead of silently flattering.
    const consAddress = consensusAddressFromPubkey(direct.consensus_pubkey?.key);
    return buildValidatorRecord(direct, consAddress ? signingInfos[consAddress] : null, totalBonded);
  }

  const leaderboard = await getValidatorLeaderboard();
  return leaderboard.find((validator) => validator.operatorAddress === operatorAddress) || null;
}

module.exports = {
  getValidatorLeaderboard,
  getValidatorDetail,
  fetchSigningInfos,
  fetchTotalBonded,
  fetchEstimatedApr,
  consensusAddressFromPubkey,
};
