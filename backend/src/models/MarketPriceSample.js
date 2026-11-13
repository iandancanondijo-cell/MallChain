const mongoose = require('mongoose');

/**
 * One minute of the on-chain MLCNS market price, written by
 * controllers/marketController.js's 15s poller.
 *
 * Why this exists: the poller's series lived only in a process-local array, so
 * every restart erased it and every "7d" figure was computed from however many
 * minutes the current process happened to have been up. The chain REST gateway
 * exposes only the *current* price (and a bounded raw transaction list), so a
 * price history is something the backend has to keep. This collection is that
 * record — a real, durable, chain-derived series rather than a fabricated curve.
 *
 * Bucketed by whole minute (`bucket` = Math.floor(ts / 60000), unique) because
 * the poller samples every 15s: four samples per minute would otherwise be four
 * documents for one number, and every consumer asks for at most a few hundred
 * points. The last sample to land in a minute wins, which is what a "price at
 * 14:23" read means.
 *
 * Deliberately absent:
 *  - ratings/forecasts: nothing here predicts. `mid` is a measurement of the
 *    chain's buy/sell spread at a moment in time.
 *  - a fiat conversion: `mid` is already KES per MLCNS because the x/mlcoin
 *    market module prices in KES (see mallcoinService.getMarketPrice). Storing
 *    a second FX-derived column would give two answers to one question.
 */
const MarketPriceSampleSchema = new mongoose.Schema({
  // Minute bucket. Unique so the poller can upsert the same minute repeatedly.
  bucket: { type: Number, required: true, unique: true },

  // Epoch milliseconds of the sample that won the bucket, and when this process
  // last wrote it. `ts` is what charts sort and label on.
  ts: { type: Number, required: true, index: true },
  capturedAt: { type: Date, default: () => new Date() },

  // KES per MLCNS, already divided by the chain's 100x scale.
  buy: { type: Number, required: true },
  sell: { type: Number, required: true },
  mid: { type: Number, required: true },

  // The chain's own last_update_height for that price, when the REST gateway
  // included one. Lets a reader tie a sample back to a block rather than to
  // the clock of whatever machine polled it.
  height: { type: Number, default: null },
}, { versionKey: false });

// The two reads this collection serves: a range scan by minute bucket (windowed
// charts) and the newest sample by ts (trend aggregates).
MarketPriceSampleSchema.index({ bucket: -1 });
MarketPriceSampleSchema.index({ ts: -1 });

module.exports = mongoose.models.MarketPriceSample
  || mongoose.model('MarketPriceSample', MarketPriceSampleSchema);
