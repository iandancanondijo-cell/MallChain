const WebSocket = require('ws');

const RPC = process.env.COSMOS_RPC || process.env.CHAIN_RPC || 'http://localhost:26657';
const WS_URL = `${RPC.replace(/^http/, 'ws').replace(/\/$/, '')}/websocket`;

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

// CometBFT's own WebSocket JSON-RPC subscribe protocol (not @cosmjs/tendermint-rpc's
// client wrapper — its subscribeNewBlock() connected fine against this chain but
// never actually delivered an event; confirmed live that a raw `ws` subscription to
// the same node receives NewBlock events immediately and reliably). Replaces the
// previous setInterval(pollBlocks, 3000) REST-polling loop, which issued a
// GET /status + one GET /block per missed height every 3 seconds regardless of
// whether anything had changed.
function startBlockListener() {
  console.log('🚀 Starting blockchain event listener (WebSocket)...');

  let ws = null;
  let reconnectDelay = BASE_RECONNECT_DELAY_MS;
  let reconnectTimer = null;
  let stopped = false;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      reconnectDelay = BASE_RECONNECT_DELAY_MS;
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        id: 'block-listener',
        params: { query: "tm.event='NewBlock'" },
      }));
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        console.error('Block listener: malformed WS message:', err.message);
        return;
      }

      const value = msg.result?.data?.value;
      if (!value) return; // subscription ack, not a block event

      handleNewBlock(value);
    });

    ws.on('error', (err) => {
      console.error('Block listener WS error:', err.message);
    });

    ws.on('close', () => {
      if (stopped) return;
      console.warn(`Block listener WS closed — reconnecting in ${reconnectDelay}ms`);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    });
  }

  function handleNewBlock(value) {
    try {
      const header = value.block?.header;
      const height = Number(header?.height);
      const hash = value.block_id?.hash;
      const txs = value.block?.data?.txs || [];
      const txResults = value.result_finalize_block?.tx_results || [];

      if (global.io) {
        global.io.emit('block:new', {
          height,
          hash,
          timestamp: header?.time,
          txCount: txs.length,
        });
      }

      console.log(`📦 New block #${height} with ${txs.length} transactions`);

      if (global.io) {
        txs.forEach((_txData, idx) => {
          const result = txResults[idx];
          if (!result) return;
          global.io.emit('tx:confirmed', {
            height,
            index: idx,
            code: result.code,
            log: result.log,
            timestamp: new Date().toISOString(),
          });
        });
      }
    } catch (err) {
      console.error('Error handling new block event:', err.message);
    }
  }

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  };
}

module.exports = {
  startBlockListener,
};
