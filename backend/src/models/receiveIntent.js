/**
 * ReceiveIntent — a receiver's stated payment amount for a wallet address.
 *
 * When a wallet owner "activates receive" with a stated amount, the peer
 * that sends to this address must send EXACTLY that amount:
 *  - amount matches  -> the transfer proceeds and the intent is `satisfied`
 *  - amount differs  -> the transfer is rejected (409) and BOTH parties'
 *    session ends as `failed` — neither side can pretend the other agreed
 *    to a different figure. This is the anti-cheat guard the product spec
 *    asks for: one party quietly altering the amount can no longer slip
 *    past the other.
 *  - no intent       -> the sender may send any amount (classic behavior)
 *
 * Intents expire on a TTL so an old stated amount can't haunt an address
 * forever (Mongo TTL index drops the doc; expiry is also re-checked on read).
 */
const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  from: { type: String },                 // sender address (public bech32)
  amountMlcns: { type: Number },          // what the sender attempted
  microAmount: { type: Number },          // micro-MLCNS (rounded) actually attempted
  expectedMicro: { type: Number },        // micro-MLCNS the receiver had stated
  reason: { type: String },               // 'amount_mismatch'
  at: { type: Date, default: Date.now },
}, { _id: false, strict: false });

const ReceiveIntentSchema = new mongoose.Schema({
  // Target wallet address (public bech32) the amount is stated for.
  walletAddress: { type: String, required: true, match: /^mall1[a-z0-9]{38,58}$/ },
  // The account that created it (optional — a wallet with no linked
  // account can still declare; then createdBy is null).
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Stated amount in whole MLCNS (the UI unit). Comparison is done in
  // micro-MLCNS integers to avoid float wobble.
  amountMlcns: { type: Number, required: true, min: 0.000001 },
  microAmount: { type: Number, required: true },
  note: { type: String, maxlength: 200 },
  status: {
    type: String,
    enum: ['active', 'satisfied', 'failed', 'cancelled'],
    default: 'active',
    index: true,
  },
  failure: {
    type: {
      reason: String,           // 'amount_mismatch'
      attemptedAmountMlcns: Number,
      senderAddress: String,
      at: Date,
    },
    default: null,
  },
  attempts: { type: [attemptSchema], default: [] },
  // Logical expiry — deliberately NOT a Mongo TTL delete: the receiver's
  // session UI must still be able to read a 'failed'/'satisfied' intent
  // after expiry to show the outcome of the session. findActive() treats
  // past-expiry 'active' docs as gone.
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

ReceiveIntentSchema.index({ expiresAt: 1, status: 1 }, { background: true });

// At most one live intent per address.
ReceiveIntentSchema.index({ walletAddress: 1, status: 1 }, { background: true });

ReceiveIntentSchema.statics.MICRO = 1e6;
ReceiveIntentSchema.statics.toMicro = (mlcns) => Math.round(Number(mlcns) * 1e6);

/** Return the live (unexpired, active) intent for an address, or null. */
ReceiveIntentSchema.statics.findActive = async function (walletAddress) {
  const doc = await this.findOne({ walletAddress, status: 'active' }).sort({ createdAt: -1 }).lean();
  if (!doc) return null;
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
    // TTL lag: mark cancelled so subsequent reads don't re-pay the expiry check.
    await this.updateOne({ _id: doc._id }, { $set: { status: 'cancelled' } }).catch(() => {});
    return null;
  }
  return doc;
};

module.exports = mongoose.models.ReceiveIntent || mongoose.model('ReceiveIntent', ReceiveIntentSchema);
