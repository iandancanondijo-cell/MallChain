const axios = require('axios');
const { config } = require('../config');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

async function getUserBadgeInfo(address) {
  const url = `${CHAIN_REST}/tmp/marketplace/badge/v1/user_badge/${encodeURIComponent(address)}`;
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const badge = data.user_badge || data.userBadge || {};
    return {
      exists: true,
      badgeType: badge.badge_type || badge.badgeType || null,
      issuedAt: badge.issued_at || badge.issuedAt || null,
      source: 'chain',
      raw: badge,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return { exists: false, badgeType: null, source: 'chain' };
    }
    return { exists: false, error: err.message, source: 'chain_unavailable' };
  }
}

module.exports = {
  getUserBadgeInfo,
};
