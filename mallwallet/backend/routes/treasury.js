const router = require('express').Router()
const axios = require('axios')

const RPC = process.env.RPC

router.get('/metrics', async (_req, res) => {
  try {
    const response = await axios.get(
      `${RPC}/marketplace/mlcoin/v1/treasury_metrics`
    )

    res.json(response.data)
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

router.get('/history', async (_req, res) => {
  try {
    const response = await axios.get(
      `${RPC}/marketplace/mlcoin/v1/treasury_history`
    )

    res.json(response.data)
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

module.exports = router