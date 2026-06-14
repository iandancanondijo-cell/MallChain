const axios = require('axios');
const db = require('../db');

const RPC = process.env.RPC_URL || 'http://localhost:26657';

function parseCommission(commission) {
  if (!commission) return 0.0;
  if (typeof commission === 'string') {
    return parseFloat(commission) || 0.0;
  }
  if (commission.commission_rates && commission.commission_rates.rate) {
    return parseFloat(commission.commission_rates.rate) || 0.0;
  }
  return 0.0;
}

async function indexValidators() {
  try {
    const response = await axios.get(`${RPC}/validators`);
    const validators = response.data.result.validators || [];

    if (validators.length === 0) {
      console.log('No validators found');
      return false;
    }

    for (const validator of validators) {
      try {
        const address = validator.operator_address || validator.address || validator.consensus_pubkey?.key;
        if (!address) {
          continue;
        }

        const moniker = validator.description?.moniker || validator.moniker || validator.name || 'Unknown';
        const votingPower = parseInt(validator.voting_power || validator.tokens || 0, 10) || 0;
        const commission = parseCommission(validator.commission);
        const jailed = validator.jailed === true || validator.jailed === 'true';

        await db.query(
          `
          INSERT INTO validators (
            address,
            moniker,
            voting_power,
            commission,
            uptime,
            jailed,
            rewards,
            produced_blocks,
            missed_blocks,
            slash_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (address)
          DO UPDATE SET
            moniker = EXCLUDED.moniker,
            voting_power = EXCLUDED.voting_power,
            commission = EXCLUDED.commission,
            uptime = EXCLUDED.uptime,
            jailed = EXCLUDED.jailed,
            updated_at = NOW()
          `,
          [
            address,
            moniker,
            votingPower,
            commission,
            100.0,
            jailed,
            0,
            0,
            0,
            0
          ]
        );
      } catch (err) {
        console.error(`Error indexing validator ${validator.address || 'unknown'}:`, err.message);
      }
    }

    console.log(`✓ Indexed ${validators.length} validators`);
    return true;
  } catch (err) {
    console.error('✗ Error indexing validators:', err.message);
    return false;
  }
}

module.exports = indexValidators;
