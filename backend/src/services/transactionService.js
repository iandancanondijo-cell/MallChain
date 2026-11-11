const { broadcastRawTxBase64 } = require('../utils/cosmosClient')
const axios = require('axios')


// Server-side signing of transfers is gone. The removed `serverSign` branch
// built a MsgSend from caller-supplied `from`/`to`/`amount` and signed it with
// the operator key, so any request naming the operator address could move
// system funds. Callers still pass from/to/amount for their own bookkeeping;
// they are intentionally not read here.
async function broadcastTransaction({
  signedTxBase64 = null
}) {
  if (!signedTxBase64) {
    throw new Error('Missing signed transaction: submit client-signed txBytes')
  }

  const resp = await broadcastRawTxBase64(signedTxBase64, process.env.BROADCAST_MODE || 'BROADCAST_MODE_SYNC')
  return resp
}

module.exports = {
  broadcastTransaction
}
