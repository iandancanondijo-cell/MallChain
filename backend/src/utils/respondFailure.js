/**
 * respondFailure / respondDriverError — one place that decides whether a caught
 * exception is the CLIENT's fault or the SERVER's.
 *
 * The backend had ~140 handlers shaped like this:
 *
 *   } catch (e) { res.status(500).json(fail(e)); }
 *
 * Each router owns a `fail(err, context?)` that logs and shapes the body for
 * that router's response contract (`{ ok:false, error }`, or `{ error }`). What
 * none of them could tell apart was a Mongoose CastError — a URL value that
 * cannot be an id at all, like `/api/careers/openings/undefined`, or
 * `/api/edu/catalog` where `catalog` matched the `/:id` route — from a real
 * failure. All of them answered 500, which is wrong three times over:
 *
 *   * the request was malformed, which is 400 — 5xx tells the client "retry and
 *     it may work", and retrying a bad id never helps;
 *   * "Invalid request" / "internal error" names nothing, so a user sees a red
 *     toast and an admin sees a bug report with no clue in it;
 *   * it spent the 5xx budget that `/metrics`, the admin health panels and the
 *     alert webhook all read, so a real outage hides behind other people's
 *     typos.
 *
 * Genuine server faults are untouched: same status, same local body, same
 * error-level log line.
 */
const { classifyDriverError } = require('./errorHandler');
const logger = require('./logger');

/**
 * Answer `res` with the 4xx this driver error really represents.
 * Returns false (without touching `res`) when the error is not client-caused.
 */
function answerClientFailure(res, err, extraLogContext) {
  const client = classifyDriverError(err);
  if (!client) return false;

  const req = res.req || {};
  // Warn, not error: the caller sent something unparseable. Logging that at
  // error level is how a scraper probing `/api/x/null` becomes an alert storm.
  logger.warn('bad-request', `${req.method} ${req.path} - ${client.code}`, {
    path: req.path,
    method: req.method,
    statusCode: client.statusCode,
    // The raw driver message names the model and echoes the offending value;
    // it belongs in the log, never in the response.
    driverError: err && err.message,
    ...(extraLogContext || {}),
  });

  res.status(client.statusCode).json({ ok: false, error: client.message, code: client.code });
  return true;
}

/**
 * @param {import('express').Response} res
 * @param {unknown} err                 the caught value
 * @param {(err: unknown, ctx?: object) => object} localFail  the router's own fail()
 * @param {object} [context]            extra log context, forwarded to localFail
 */
function respondFailure(res, err, localFail, context) {
  if (answerClientFailure(res, err, context)) return undefined;
  return res.status(500).json(localFail(err, context));
}

/**
 * Variant for routers whose catch blocks build their own 500 body inline
 * (adminPanel.js and messaging.js between them have 72 of them, each with
 * wording the frontend already parses). Returns true when it answered — a
 * malformed id — so the caller skips its own 500; false means "this really is
 * our fault, report it the way you always have".
 *
 *   } catch (err) {
 *     if (respondDriverError(res, err)) return;
 *     res.status(500).json({ ok: false, error: 'internal error' });
 *   }
 */
function respondDriverError(res, err, context) {
  return answerClientFailure(res, err, context);
}

module.exports = { respondFailure, respondDriverError };
