const { creditMlcns, getFaucetStatus, fundGas } = require('../services/faucetService');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const { emitMlcnsTransferReceived, userIdForAddress } = require('../services/activityEvents');

// faucetService throws plain Errors that carry a deliberate HTTP `.status`
// (429 cooldown, 403 disabled, 400 bad address, 503 unavailable) together with
// a message written for the end user. errorHandler()'s B11 remediation masks
// the message of every non-AppError, so those hand-authored texts reached the
// client as "Internal server error. Please try again later." and the frontend
// could not tell a cooldown from an outage. Convert them here — this is our own
// copy, not a driver/library leak. An error with no explicit status (e.g. a
// Redis failure from getFaucetStatus) is deliberately left alone so it still
// gets the generic masked 500.
function exposeServiceError(err) {
  const status = err?.statusCode ?? err?.status;
  if (!Number.isInteger(status)) return err;
  let code = ErrorCodes.INTERNAL_ERROR;
  if (status === 429) code = ErrorCodes.RATE_LIMIT_EXCEEDED;
  else if (status === 403) code = ErrorCodes.INSUFFICIENT_PERMISSIONS;
  else if (status === 400) code = ErrorCodes.INVALID_REQUEST_FORMAT;
  else if (status >= 500) code = ErrorCodes.SERVICE_UNAVAILABLE;
  return new AppError(code, err.message, status);
}

exports.status = asyncHandler(async (_req, res) => {
  const status = await getFaucetStatus();
  return res.json(status);
});

exports.requestMlcns = asyncHandler(async (req, res) => {
  const { address, amountMlcns } = req.body || {};
  if (!address) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'address is required', 400);
  }
  try {
    // faucetService throws plain Errors with a real `.status` (429 cooldown,
    // 503 unavailable, etc.); exposeServiceError() above turns them into an
    // AppError so both the status and the authored message survive
    // errorHandler.js's B11 masking. The C1-specific `faucet_unfunded` code
    // surfaces here with HTTP 503 and a structured `detail` block so the
    // frontend can render the explicit "Faucet not ready — contact admin" card
    // instead of a generic spinner.
    const result = await creditMlcns(address, amountMlcns);
    // Email the wallet holder that faucet MLCNS landed (fire-and-forget).
    userIdForAddress(address)
      .then((uid) => uid && emitMlcnsTransferReceived(uid, {
        mlcns_amount: amountMlcns ?? result?.transfer?.amountMlcns,
        sender_display: 'Mallchain Faucet',
        reference_id: result?.transfer?.txHash || 'pending',
      }))
      .catch(() => {});
    return res.json(result);
  } catch (err) {
    if (err && err.code === 'faucet_unfunded') {
      return res.status(err.status || 503).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          faucetAddress: err.faucetAddress,
        },
      });
    }
    if (err.rawLog) {
      throw new AppError(ErrorCodes.INVALID_TRANSACTION, err.message, err.status || 500, { log: err.rawLog });
    }
    throw exposeServiceError(err);
  }
});

exports.fundGas = asyncHandler(async (req, res) => {
  const { address } = req.body || {};
  if (!address) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'address is required', 400);
  }
  try {
    const result = await fundGas(address);
    return res.json(result);
  } catch (err) {
    if (err && err.code === 'faucet_unfunded') {
      return res.status(err.status || 503).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          faucetAddress: err.faucetAddress,
        },
      });
    }
    throw exposeServiceError(err);
  }
});
