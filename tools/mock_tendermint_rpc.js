const http = require('http')
const url = require('url')

const PORT = process.env.PORT || 26657

function sendJSON(res, obj, code=200) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true)

  if (req.method === 'GET' && u.pathname === '/status') {
    const resp = {
      jsonrpc: '2.0',
      result: {
        node_info: { network: 'mocknet' },
        sync_info: { latest_block_height: '1', catching_up: false }
      },
      id: -1
    }
    return sendJSON(res, resp)
  }

  // default 404
  sendJSON(res, { error: 'not found' }, 404)
})

server.listen(PORT, () => console.log('Mock Tendermint RPC listening on', PORT))
