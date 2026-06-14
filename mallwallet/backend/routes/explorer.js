const router = require('express').Router()
const axios = require('axios')

router.get('/block/:height', async (req, res) => {
  try {
    const block = await axios.get(
      `${process.env.RPC}/block?height=${req.params.height}`
    )

    res.json(block.data)
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

module.exports = router