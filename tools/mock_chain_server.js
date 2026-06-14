const express = require('express')
const app = express()
const port = process.env.PORT || 1317

let buy = 62 // scaled by 100 -> 0.62 Ksh
let sell = 58
let height = 1

app.get('/tmp/marketplace/mlcoin/v1/market/price', (req, res) => {
  // return protobuf-like JSON structure the backend expects
  res.json({
    market_price: {
      buy_price: buy,
      sell_price: sell,
      last_update_height: String(height),
      total_buy_volume: "0",
      total_sell_volume: "0"
    }
  })
})

app.get('/tmp/marketplace/mlcoin/v1/emission_state', (req, res) => {
  // return emission state including total_supply (scaled by 100 for demo)
  res.json({
    emission_state: {
      total_supply: 1230411,
      circulating: 1230411,
      monthly_cap: 1000000,
      daily_limit: 10000,
      current_month: 1,
      current_day: 1
    }
  })
})

// simple endpoint to adjust price for testing
app.post('/tmp/marketplace/mlcoin/v1/market/price/set', express.json(), (req, res) => {
  const { buy_price, sell_price } = req.body || {}
  if (typeof buy_price === 'number') buy = buy_price
  if (typeof sell_price === 'number') sell = sell_price
  height += 1
  res.json({ ok: true, buy_price: buy, sell_price: sell, height })
})

app.listen(port, () => console.log('Mock chain REST listening on', port))
