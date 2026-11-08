/**
 * ReceiveIntent enforcement for the wallet→wallet broadcast relays.
 *
 * If the recipient address has an ACTIVE stated-amount intent (the receiver
 * "activated receive" with a specific amount), the transfer must send
 * EXACTLY that amount:
 *   - match     -> request proceeds; `req.receiveIntent` is attached and the
 *                  settle hook marks the intent satisfied once the relay
 *                  returns 2xx.
 *   - mismatch  -> 409. The intent flips to `failed`, which by design ends
 *                  BOTH the sender's send and the receiver's watching
 *                  session — neither party can quietly move a different
 *                  number than the one the other side agreed to.
 *   - no intent -> classic behavior, any amount goes through.
 *
 * Comparison happens in integer micro-MLCNS (round(amount × 1e6)) so float
 * noise in the UI can't create false mismatches.
 */
const ReceiveIntent = require('../models/receiveIntent');

const ADDRESS_RE = /^mall1[a-z0-9]{38,58}$/;

function enforceReceiveIntent(req, res, next) {
  (async () => {
    try {
      const body = req.validatedBody || req.body || {};
      const to = body.to;
      // /mallcoins carries `amount`; /mlcns/transfer carries `amountMlcns`.
      const amount = Number(body.amount ?? body.amountMlcns);
      if (!to || !ADDRESS_RE.test(to) || !Number.isFinite(amount) || amount <= 0) return next();

      const intent = await ReceiveIntent.findActive(to);
      if (!intent) return next();

      const attemptedMicro = ReceiveIntent.toMicro(amount);
      if (attemptedMicro === intent.microAmount) {
        req.receiveIntent = intent;
        return next();
      }

      // Anti-cheat: the stated amount was not honored — fail BOTH sessions.
      await ReceiveIntent.updateOne({ _id: intent._id }, {
        $set: {
          status: 'failed',
          failure: {
            reason: 'amount_mismatch',
            attemptedAmountMlcns: amount,
            senderAddress: body.from || null,
            at: new Date(),
          },
        },
        $push: {
          attempts: {
            from: body.from || null,
            amountMlcns: amount,
            microAmount: attemptedMicro,
            expectedMicro: intent.microAmount,
            reason: 'amount_mismatch',
            at: new Date(),
          },
        },
      }).catch(() => {});

      return res.status(409).json({
        success: false,
        error: 'receive_amount_mismatch',
        message: `The receiver stated exactly ${intent.amountMlcns} MLCNS for payments to this address — ${amount} MLCNS was attempted. This receive session has failed for both parties; the receiver must activate a new receive session (or send the exact stated amount).`,
        expected: { amountMlcns: intent.amountMlcns, note: intent.note || null },
        attempted: amount,
        intentId: String(intent._id),
      });
    } catch (err) {
      // Fail-open on infrastructure errors: a broken intent lookup must not
      // block ordinary wallet→wallet transfers. The intent stays untouched,
      // so a later retry can still be enforced.
      const logger = require('../utils/logger');
      logger.warn('receiveIntent', 'intent enforcement skipped (lookup failed)', { error: err.message });
      return next();
    }
  })();
}

/**
 * Wraps the broadcast controller: once the relay returns 2xx for a
 * matching amount, the intent is satisfied (session complete). Registered
 * BEFORE the controller; uses the response 'finish' event so it observes
 * the actual status code.
 */
function settleReceiveIntent(req, res, next) {
  if (req.receiveIntent) {
    res.on('finish', () => {
      if (res.statusCode < 300) {
        ReceiveIntent.updateOne(
          { _id: req.receiveIntent._id, status: 'active' },
          { $set: { status: 'satisfied', satisfiedAt: new Date() } },
        ).catch(() => {});
      }
    });
  }
  next();
}

module.exports = { enforceReceiveIntent, settleReceiveIntent };
