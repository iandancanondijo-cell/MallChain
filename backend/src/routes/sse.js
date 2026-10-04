const logger = require('../utils/logger');

const MAX_SSE_CLIENTS = Number(process.env.MAX_SSE_CLIENTS || 500);
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 15000);

let activeClients = 0;

function sseHandler(req, res) {
  if (activeClients >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: 'Too many SSE connections', retry: 30 });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(':ok\n\n');
  activeClients++;

  const userId = req.user?._id || req.user?.id || null;
  logger.debug('sse', 'Client connected', { userId, ip: req.ip });

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, SSE_HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    activeClients--;
    logger.debug('sse', 'Client disconnected', { userId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  res.sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client already gone
    }
  };

  req.sseSend = res.sendEvent;
}

function getSseStats() {
  return { activeClients, maxClients: MAX_SSE_CLIENTS };
}

module.exports = { sseHandler, getSseStats, MAX_SSE_CLIENTS };
