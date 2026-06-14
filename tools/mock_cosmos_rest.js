const http = require('http')
const url = require('url')

const PORT = process.env.PORT || 1317

function sendJSON(res, obj, code=200) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true)
  // balances endpoint
  if (req.method === 'GET' && u.pathname.startsWith('/cosmos/bank/v1beta1/balances/')) {
    // sample fixed balance response
    const resp = {
      balances: [
        { denom: 'MLCNS', amount: '100000000' },
      ],
      pagination: {}
    }
    return sendJSON(res, resp)
  }

  // broadcast tx (simple mock)
  if (req.method === 'POST' && u.pathname === '/cosmos/tx/v1beta1/txs') {
    let body = ''
    req.on('data', (c) => body += c)
    req.on('end', () => {
      const resp = { tx_response: { height: '0', txhash: 'MOCK_TX_HASH', code: 0 } }
      return sendJSON(res, resp)
    })
    return
  }

  // default 404
  sendJSON(res, { error: 'not found' }, 404)
})

server.listen(PORT, () => console.log('Mock Cosmos REST listening on', PORT))
