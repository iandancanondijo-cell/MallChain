const axios = require('axios');
const db = require('../db');

const RPC = process.env.RPC_URL || 'http://localhost:26657';

async function trackValidatorMetrics(blockHeight) {
  try {
    // Fetch current validators
    const validatorsResponse = await axios.get(`${RPC}/validators`);
    const validators = validatorsResponse.data.result.validators || [];

    // Fetch signing info for slashing data
    let signingInfoMap = {};
    try {
      const signingResponse = await axios.get(`${RPC}/signing_infos`);
      if (signingResponse.data.result) {
        signingResponse.data.result.forEach(info => {
          signingInfoMap[info.address] = info;
        });
      }
    } catch (err) {
      console.warn('Could not fetch signing info:', err.message);
    }

    // Track metrics for each validator
    for (const validator of validators) {
      const signingInfo = signingInfoMap[validator.address];

      try {
        // Calculate uptime based on signing info
        let uptime = 100;
        let missedBlocks = 0;
        let slashCount = 0;

        if (signingInfo) {
          // Typically: uptime = (index_offset - missed_blocks_counter) / index_offset * 100
          const indexOffset = parseInt(signingInfo.index_offset) || 1;
          missedBlocks = parseInt(signingInfo.missed_blocks_counter) || 0;
          uptime = Math.max(0, ((indexOffset - missedBlocks) / indexOffset) * 100);
          slashCount = signingInfo.slash_count || 0;
        }

        // Insert metrics record
        await db.query(
          `
          INSERT INTO validator_metrics (
            address,
            uptime,
            missed_blocks,
            produced_blocks,
            rewards_earned,
            slash_count,
            block_height,
            timestamp
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          `,
          [
            validator.address,
            uptime,
            missedBlocks,
            blockHeight - missedBlocks, // Approximate produced blocks
            0, // Will be updated when rewards are processed
            slashCount,
            blockHeight
          ]
        );

        // Update validator record with latest metrics
        await db.query(
          `
          UPDATE validators
          SET
            uptime = $2,
            missed_blocks = $3,
            produced_blocks = $4,
            slash_count = $5,
            updated_at = NOW()
          WHERE address = $1
          `,
          [
            validator.address,
            uptime,
            missedBlocks,
            blockHeight - missedBlocks,
            slashCount
          ]
        );

      } catch (err) {
        console.error(`Error tracking metrics for ${validator.address}:`, err.message);
      }
    }

    console.log(`✓ Tracked metrics for ${validators.length} validators at block ${blockHeight}`);
    return true;
  } catch (err) {
    console.error('Error tracking validator metrics:', err.message);
    return false;
  }
}

module.exports = { trackValidatorMetrics };
