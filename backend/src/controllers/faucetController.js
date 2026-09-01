const { creditMlcns, getFaucetStatus, fundGas } = require('../services/faucetService');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');

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
    // 503 unavailable, etc.) — errorHandler.js's global handler preserves
    // that status instead of forcing every non-AppError to 500. The
    // C1-specific `faucet_unfunded` code surfaces here with HTTP 503 and a
    // structured `detail` block so the frontend can render the explicit
    // "Faucet not ready — contact admin" card instead of a generic spinner.
    const result = await creditMlcns(address, amountMlcns);
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
    throw err;
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
    throw err;
  }
});
