/* eslint-env node */
/* global require, module, process */
const axios = require('axios');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317';
const DENOM = process.env.DENOM || 'umlcn';
const MLCNS_DECIMALS = Number(process.env.MLCNS_DECIMALS || 6);

// Fetch current circulating supply from chain
async function getCirculatingSupply() {
  try {
    const cleanBase = CHAIN_REST.replace(/\/$/, '');

    // Query the supply of the token
    const url = `${cleanBase}/cosmos/bank/v1beta1/supply/${DENOM}`;
    const resp = await axios.get(url, { timeout: 5000 });

    const supplyData = resp.data?.amount || {};
    const supplyBase = BigInt(supplyData.amount || 0);

    // Convert from base units to display units
    const supply = Number(supplyBase) / Math.pow(10, MLCNS_DECIMALS);

    console.log(`[Supply] Circulating supply: ${supply} ${DENOM}`);
    return supply;
  } catch (err) {
    console.error('[Supply] Failed to fetch circulating supply:', err.message || err);
    // Return a fallback estimate
    return 1000000000; // 1B MC fallback
  }
}

// Fetch supply at a specific height (for historical queries)
async function getCirculatingSupplyAtHeight(height) {
  try {
    const cleanBase = CHAIN_REST.replace(/\/$/, '');
    const url = `${cleanBase}/cosmos/bank/v1beta1/supply/${DENOM}`;
    const resp = await axios.get(url, {
      params: { height },
      timeout: 5000,
    });

    const supplyData = resp.data?.amount || {};
    const supplyBase = BigInt(supplyData.amount || 0);
    const supply = Number(supplyBase) / Math.pow(10, MLCNS_DECIMALS);

    return supply;
  } catch (err) {
    console.error(`[Supply] Failed to fetch supply at height ${height}:`, err.message);
    return null;
  }
}

module.exports = {
  getCirculatingSupply,
  getCirculatingSupplyAtHeight,
};
