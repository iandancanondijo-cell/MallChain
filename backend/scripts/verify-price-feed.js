/**
 * Feed harness: runs the real price/wallet/market services against a real
 * Socket.IO server and a real chain, with a real room adapter (not a mock).
 *
 * Why: the unit tests hand createPriceFeed a stand-in `io` whose adapter is a
 * plain Map. That is enough to prove the emit logic, but not that
 * `roomSize(io, 'price:updates')` ever sees a subscriber in the real adapter —
 * which is the gate every chain read hangs on. This opens a genuine socket,
 * joins the genuine room, and reports what the feed did across two poll ticks.
 *
 * Run it with the local stack up (chain + Redis + Mongo):
 *   node backend/scripts/verify-price-feed.js
 * It binds port 4099 for its own server, so it does not disturb the backend on
 * 4000, and it exits on its own after ~30 seconds.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const PORT = 4099;
process.env.PRICE_FEED_POLL_MS = '4000';

async function main() {
  // Same boot order as src/index.js: redis client -> cache service -> services.
  const redis = require('../src/mallwallet/queue/redis')();
  if (redis.status === 'wait') await redis.connect();
  await new Promise((res) => (redis.status === 'ready' ? res() : redis.once('ready', res)));
  global.redisClient = redis;
  require('../src/services/cacheService').initCacheService(redis);

  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
  io.on('connection', (socket) => {
    socket.join('price:updates');
    socket.join('market:feed');
  });
  await new Promise((r) => server.listen(PORT, r));

  const { startPriceFeed, buildSnapshot } = require('../src/services/priceEngine');
  const { startMarketFeed } = require('../src/services/marketActivityFeed');
  const stopPrice = startPriceFeed(io);
  const stopMarket = startMarketFeed(io);

  const seen = [];
  const client = connectClient(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] });
  client.on('price:current', (p) => seen.push({ at: Date.now(), mid: p.midPriceKes, source: p.source, asOf: p.asOf }));
  await new Promise((r) => client.once('connect', r));
  console.log('room size after join:', io.sockets.adapter.rooms.get('price:updates')?.size);

  // The primer can take ~10s when the chain REST is slow, so wait for the feed
  // to actually hold a snapshot before testing anything time-sensitive.
  const t0 = Date.now();
  const priceEngine = require('../src/services/priceEngine');
  for (let waited = 0; waited < 30000; waited = Date.now() - t0) {
    if (priceEngine.getPriceFeedStatus().lastPriceAt) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`first snapshot after ${Date.now() - t0}ms:`, JSON.stringify(priceEngine.getPriceFeedStatus()));
  console.log('emissions seen so far:', JSON.stringify(seen));

  // One chain read primes the 30s cache; 4s ticks then hit it. The marker is
  // that the key exists again right after being deleted, which only a live
  // poller can do.
  await redis.del('mc:v1:market_price');
  console.log('TTL immediately after delete:', await redis.ttl('mc:v1:market_price'));
  await new Promise((r) => setTimeout(r, 10000));
  console.log('TTL 10s later (a poller must have refilled it):', await redis.ttl('mc:v1:market_price'));
  console.log('value:', String(await redis.get('mc:v1:market_price') || '').slice(0, 90));
  console.log('feed status:', JSON.stringify(priceEngine.getPriceFeedStatus()));
  console.log('price emissions seen:', JSON.stringify(seen));
  console.log('market feed status:', JSON.stringify(require('../src/services/marketActivityFeed').getMarketFeedStatus?.() ?? null));

  // Now prove the gate closes: everybody leaves, the key expires, and nobody
  // refills it.
  client.close();
  for (const s of io.sockets.sockets.values()) s.disconnect(true);
  await new Promise((r) => setTimeout(r, 1200));
  console.log('room size after everyone left:', io.sockets.adapter.rooms.get('price:updates')?.size ?? 0);
  await redis.del('mc:v1:market_price');
  await new Promise((r) => setTimeout(r, 12000));
  console.log('TTL 12s after last subscriber left (-2 = no chain traffic):', await redis.ttl('mc:v1:market_price'));
  console.log('feed status after leaving:', JSON.stringify(priceEngine.getPriceFeedStatus()));

  stopPrice();
  stopMarket();
  io.close();
  server.close();
  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(1);
});
