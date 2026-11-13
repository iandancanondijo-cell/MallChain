/**
 * The realtime block feed's contract, tested without a running node.
 *
 * What this pins down, in the order it would hurt to get wrong:
 *
 *  1. `block:new` actually reaches the `blocks:live` room. The subscription
 *     handler, the client listener and the explorer's rendering of the event
 *     all existed; the emitter never did, so every "live" block panel was
 *     really a 10s poll and nothing here would have caught its absence.
 *  2. The payload is complete enough to paint a block. The first version of
 *     this feed carried height/hash/timestamp only, which forced the client to
 *     spend a REST round-trip per block just to show the tx count — the exact
 *     traffic this feature exists to remove.
 *  3. Duplicate and backwards deliveries are dropped (a resubscribe replays the
 *     current height, and the fallback poll can see a block before the socket
 *     does), so a page never gets the same block twice.
 *  4. The fallback poll costs nothing while nobody is watching.
 *
 * A real `ws` server on an ephemeral port stands in for the node's
 * /websocket endpoint, because the message framing (result.data.value) is the
 * part worth pinning. axios is mocked: the REST fallback is asserted through
 * the mock's call count rather than a second fake chain.
 */
const http = require('http');
const { WebSocketServer } = require('ws');

jest.mock('axios', () => ({
  get: jest.fn(() => Promise.reject(new Error('REST not available in this test'))),
}));

jest.mock('../utils/logger', () => {
  const entries = [];
  const record = (level) => (...args) => entries.push({ level, args });
  return {
    __entries: entries,
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
  };
});

jest.mock('../config', () => ({
  config: {
    chain: {
      rpc: 'http://127.0.0.1:26657',
      rest: 'http://127.0.0.1:1317',
      id: 'mallchain_9100-1',
    },
  },
}));

const axios = require('axios');
const { createBlockFeed, normalizeBlockValue } = require('../services/blockBroadcaster');

const HASH_HEX = 'A'.repeat(64);
const HASH_B64 = Buffer.from(HASH_HEX, 'hex').toString('base64');
// A validator address is 20 bytes, which is 40 hex characters.
const PROPOSER_HEX = '8FA11154FA' + '0'.repeat(28) + 'AA';
const PROPOSER_B64 = Buffer.from(PROPOSER_HEX, 'hex').toString('base64');

function blockValue(height, { txCount = 0, time = '2026-11-11T16:48:51.068625002Z' } = {}) {
  return {
    block: {
      header: {
        height: String(height),
        time,
        chain_id: 'mallchain_9100-1',
        proposer_address: PROPOSER_B64,
      },
      data: { txs: Array.from({ length: txCount }, (_, i) => `dHhzb21l${i}`) },
    },
    block_id: { hash: HASH_B64 },
  };
}

/** Exactly what a CometBFT event websocket sends for one NewBlock event. */
function newBlockMessage(height, opts) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    result: {
      query: "tm.event = 'NewBlock'",
      data: { type: 'tendermint/event/NewBlock', value: blockValue(height, opts) },
      events: { 'tm.event': ['NewBlock'], Height: [String(height)] },
    },
  });
}

function makeIo(subscribers = 1) {
  const rooms = new Map();
  if (subscribers > 0) {
    rooms.set('blocks:live', new Set(Array.from({ length: subscribers }, (_, i) => `socket-${i}`)));
  }
  const emitted = [];
  return {
    emitted,
    rooms,
    sockets: { adapter: { rooms } },
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

async function startFakeNode() {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const clients = [];
  const received = [];
  wss.on('connection', (client) => {
    clients.push(client);
    client.on('message', (raw) => received.push(JSON.parse(raw.toString())));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `ws://127.0.0.1:${server.address().port}/websocket`,
    clients,
    received,
    broadcast(message) {
      for (const client of clients) client.send(message);
    },
    close: () =>
      new Promise((resolve) => {
        for (const client of clients) client.terminate();
        wss.close(() => server.close(resolve));
      }),
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('normalizeBlockValue', () => {
  it('converts a node block into the socket payload the explorer renders', () => {
    const block = normalizeBlockValue(blockValue(329245, { txCount: 3 }));
    expect(block).toMatchObject({
      height: 329245,
      hash: HASH_HEX,
      txCount: 3,
      numTxs: 3,
      chainId: 'mallchain_9100-1',
    });
    expect(block.timestamp).toBe(new Date('2026-11-11T16:48:51.068625002Z').toISOString());
    expect(block.unixTime).toBe(Math.floor(Date.parse(block.timestamp) / 1000));
    expect(typeof block.height).toBe('number');
    // The node sends the proposer as hex on the event socket and as base64 on
    // REST; the feed normalizes to hex so a socket row and a polled row show the
    // same validator string.
    expect(block.proposer).toBe(PROPOSER_HEX);
  });

  it('drops an event with no usable height instead of guessing height 0', () => {
    expect(normalizeBlockValue(null)).toBeNull();
    expect(normalizeBlockValue({})).toBeNull();
    expect(normalizeBlockValue({ block: { header: { height: 'not-a-number' } } })).toBeNull();
    expect(normalizeBlockValue({ block: { header: { height: '0' } } })).toBeNull();
  });

  it('reports an empty tx list as zero rather than undefined', () => {
    const value = blockValue(10);
    delete value.block.data;
    expect(normalizeBlockValue(value).txCount).toBe(0);
  });
});

describe('block feed over the node event websocket', () => {
  let node;
  let feed;
  let io;

  afterEach(async () => {
    if (feed) feed.stop();
    feed = null;
    if (node) await node.close();
    node = null;
  });

  it('emits block:new to blocks:live for each new height, once', async () => {
    node = await startFakeNode();
    io = makeIo(2);
    feed = createBlockFeed({ wsUrl: node.url, fallbackPollMs: 10_000 });
    feed.start(io);

    expect(await waitFor(() => node.clients.length > 0)).toBe(true);
    // The subscription is what makes this push-based; a silent failure here is
    // how "the socket connects but no blocks arrive" starts.
    expect(await waitFor(() => node.received.some((m) => m.method === 'subscribe' && m.params?.query?.includes('NewBlock')))).toBe(true);

    node.broadcast(newBlockMessage(101, { txCount: 2 }));
    expect(await waitFor(() => io.emitted.length === 1)).toBe(true);

    const first = io.emitted[0];
    expect(first.room).toBe('blocks:live');
    expect(first.event).toBe('block:new');
    expect(first.payload).toMatchObject({ height: 101, numTxs: 2, hash: HASH_HEX, proposer: PROPOSER_HEX, source: 'ws' });

    // Same height replayed (resubscribe) and a backwards height are both
    // ignored; the next real height lands.
    node.broadcast(newBlockMessage(101));
    node.broadcast(newBlockMessage(100));
    node.broadcast(newBlockMessage(102, { txCount: 5 }));
    expect(await waitFor(() => io.emitted.length === 2)).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(io.emitted).toHaveLength(2);
    expect(io.emitted[1].payload.height).toBe(102);
    expect(feed.getLatest().height).toBe(102);
  });

  it('ignores unrelated event types on the same connection', async () => {
    node = await startFakeNode();
    io = makeIo(1);
    feed = createBlockFeed({ wsUrl: node.url, fallbackPollMs: 10_000 });
    feed.start(io);
    expect(await waitFor(() => node.clients.length > 0)).toBe(true);

    node.broadcast(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        result: {
          query: "tm.event = 'Tx'",
          data: { type: 'tendermint/event/Tx', value: { TxResult: {} } },
          events: { 'tm.event': ['Tx'] },
        },
      })
    );
    // Garbage that is not JSON at all must also be survivable.
    node.broadcast('not json');
    await new Promise((r) => setTimeout(r, 150));
    expect(io.emitted).toHaveLength(0);
  });

  it('stops emitting and releases the connection on stop()', async () => {
    node = await startFakeNode();
    io = makeIo(1);
    feed = createBlockFeed({ wsUrl: node.url, fallbackPollMs: 10_000 });
    feed.start(io);
    expect(await waitFor(() => node.clients.length > 0)).toBe(true);

    const clientCountWhenConnected = node.clients.length;
    feed.stop();
    expect(await waitFor(() => node.clients.every((c) => c.readyState !== 1), 2000)).toBe(true);
    expect(clientCountWhenConnected).toBe(1);

    // A late event after shutdown must not reach a server that is closing.
    io.emitted.length = 0;
    await new Promise((r) => setTimeout(r, 50));
    expect(io.emitted).toHaveLength(0);
  });
});

describe('block feed REST fallback', () => {
  afterEach(async () => {
    if (global.__feed) global.__feed.stop();
    global.__feed = null;
    if (global.__node) await global.__node.close();
    global.__node = null;
  });

  it('publishes a REST-polled block when the event socket is unreachable', async () => {
    // Port 1 on loopback: nothing accepts there, so the feed goes straight to
    // its fallback without a flaky dependency on timing.
    axios.get.mockImplementation((url) =>
      Promise.resolve({ data: blockValueFromUrl(url, 4001) })
    );
    const io = makeIo(1);
    const feed = createBlockFeed({
      wsUrl: 'ws://127.0.0.1:1/websocket',
      restUrl: 'http://127.0.0.1:1',
      fallbackPollMs: 100_000,
      minBackoffMs: 100_000,
    });
    global.__feed = feed;
    feed.start(io);

    expect(await waitFor(() => io.emitted.length > 0)).toBe(true);
    expect(io.emitted[0].payload).toMatchObject({ height: 4001, source: 'rest' });
    expect(io.emitted[0].payload.hash).toBe(HASH_HEX);
    expect(io.emitted[0].payload.txCount).toBe(1);

    // A second poll that sees the same height emits nothing new.
    const before = io.emitted.length;
    await feed.pollOnce();
    expect(io.emitted).toHaveLength(before);
  });

  it('makes no chain request at all while nobody is in the room', async () => {
    const io = makeIo(0);
    const feed = createBlockFeed({
      wsUrl: 'ws://127.0.0.1:1/websocket',
      restUrl: 'http://127.0.0.1:1',
      fallbackPollMs: 100_000,
      minBackoffMs: 100_000,
    });
    global.__feed = feed;
    feed.start(io);
    await feed.pollOnce();
    expect(axios.get).not.toHaveBeenCalled();
    expect(io.emitted).toHaveLength(0);
    feed.stop();
  });

  it('survives a failing poll and reports the status it should', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const io = makeIo(1);
    const feed = createBlockFeed({
      wsUrl: 'ws://127.0.0.1:1/websocket',
      restUrl: 'http://127.0.0.1:1',
      fallbackPollMs: 100_000,
      minBackoffMs: 100_000,
    });
    global.__feed = feed;
    feed.start(io);
    await feed.pollOnce();
    expect(io.emitted).toHaveLength(0);
    expect(feed.getLatest()).toBeNull();
    // The status is what an operator reads when a panel looks frozen: no push
    // connection, the safety-net loop armed, nothing ever published.
    expect(feed.getStatus()).toMatchObject({ connected: false, polling: true, pushQuiet: true, lastHeight: 0 });
    expect(feed.getStatus().lastBlockAt).toBeNull();
    feed.stop();
    expect(feed.getStatus().polling).toBe(false);
  });

  it('polls even with the event socket open, once the push path goes quiet', async () => {
    // A node whose event index is disabled accepts the subscription and then
    // delivers nothing. Without this the feed would look connected forever
    // while every client sat on its last block.
    const node = await startFakeNode();
    const io = makeIo(1);
    axios.get.mockImplementation((url) => Promise.resolve({ data: blockValueFromUrl(url, 5001) }));
    const feed = createBlockFeed({ wsUrl: node.url, fallbackPollMs: 100_000, stallMs: 30 });
    global.__node = node;
    global.__feed = feed;
    feed.start(io);
    expect(await waitFor(() => node.clients.length > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 60));

    expect(feed.getStatus()).toMatchObject({ connected: true, pushQuiet: true });
    await feed.pollOnce();
    expect(axios.get).toHaveBeenCalled();
    expect(io.emitted[io.emitted.length - 1].payload).toMatchObject({ height: 5001, source: 'rest' });

    // A delivered event makes the push path loud again, and the poll stops
    // costing the node anything.
    node.broadcast(newBlockMessage(5002, { txCount: 1 }));
    expect(await waitFor(() => io.emitted.some((e) => e.payload.height === 5002))).toBe(true);
    expect(feed.getStatus().pushQuiet).toBe(false);
    const calls = axios.get.mock.calls.length;
    await feed.pollOnce();
    expect(axios.get).toHaveBeenCalledTimes(calls);
  });
});

function blockValueFromUrl(_url, height) {
  return { block_id: { hash: HASH_B64 }, block: blockValue(height, { txCount: 1 }).block };
}

describe('block hash decoding', () => {
  it('leaves a 64-char hex hash alone and base64-decodes the node form', () => {
    const { decodeHash } = require('../services/blockBroadcaster');
    expect(decodeHash(HASH_HEX.toLowerCase())).toBe(HASH_HEX);
    expect(decodeHash(HASH_B64)).toBe(HASH_HEX);
    expect(decodeHash(undefined)).toBe('');
    // Two bytes is not a hash; passing the input through beats inventing a
    // short hex string that would render like a truncated one.
    expect(decodeHash('abc')).toBe('abc');
  });

  it('accepts a validator address in either of the encodings the node uses', () => {
    const { decodeAddress } = require('../services/blockBroadcaster');
    // Observed live: hex on the NewBlock event, base64 on REST block responses.
    expect(decodeAddress(PROPOSER_HEX)).toBe(PROPOSER_HEX);
    expect(decodeAddress(PROPOSER_HEX.toLowerCase())).toBe(PROPOSER_HEX);
    expect(decodeAddress(PROPOSER_B64)).toBe(PROPOSER_HEX);
    expect(decodeAddress('')).toBe('');
    expect(decodeAddress('not-an-address')).toBe('not-an-address');
  });
});
