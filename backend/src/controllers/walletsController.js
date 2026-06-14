const axios = require('axios')

const CHAIN_REST = process.env.CHAIN_REST_URL || process.env.VITE_CHAIN_REST || 'http://localhost:1317'

/**
 * GET /api/network/wallets
 * Returns all wallets with a nonzero MLCNS balance and their balances
 */
async function getAllWalletsWithMallcoins(req, res) {
  try {
    // 1. Get all accounts (pagination supported)
    let nextKey = null
    let allAccounts = []
    do {
      const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/auth/v1beta1/accounts` + (nextKey ? `?pagination.key=${encodeURIComponent(nextKey)}` : '')
      const resp = await axios.get(url)
      const accounts = resp.data.accounts || []
      allAccounts = allAccounts.concat(accounts)
      nextKey = resp.data.pagination && resp.data.pagination.next_key
    } while (nextKey)

    // 2. For each account, get its MLCNS balance
    const balances = []
    for (const acct of allAccounts) {
      const address = acct.address
      const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/bank/v1beta1/balances/${address}`
      const resp = await axios.get(url)
      const coins = resp.data.balances || []
      const mlc = coins.find(c => c.denom === 'mlcns')
      if (mlc && Number(mlc.amount) > 0) {
        balances.push({ address, amount: Number(mlc.amount) / 1_000_000 })
      }
    }
    // 3. Calculate total
    const total = balances.reduce((sum, b) => sum + b.amount, 0)
    res.json({ wallets: balances, total })
  } catch (err) {
    console.error('[Wallets] Error fetching wallets:', err.message)
    // Return empty wallets instead of 500 when blockchain unavailable
    res.json({ wallets: [], total: 0 })
  }
}

module.exports = {
  getAllWalletsWithMallcoins
}