/**
 * Task 6.2-6.7: Global Error Handler Middleware
 * 
 * Catches all unhandled errors thrown in routes or middleware
 * Provides centralized error logging and response formatting
 * 
 * Error handling flow:
 * 1. Route throws error or calls next(error)
 * 2. Error handler catches it with (err, req, res, next) signature
 * 3. Logs full error details (stack, user, IP, request context)
 * 4. Returns generic error message to client (no stack traces in production)
 * 5. Includes Request ID for correlating logs with client reports
 * 
 * Task 6.6: Error logging includes:
 * - Request ID: Matches X-Request-ID header for tracing through logs
 * - User ID: Who made the request (if authenticated)
 * - IP address: Where request came from (for security analysis)
 * - Request method/path: What operation failed
 * - Full stack trace: For debugging (log only, not sent to client)
 * 
 * Task 6.2-6.3: Client receives safe, non-technical error messages:
 * - Production: "Internal server error" (no details exposed)
 * - Development: Actual error message (for debugging)
 * 
 * This prevents information leakage to attackers who could learn about
 * system internals from error messages
 */

const logger = require('../utils/logger');
const { config } = require('../config');

// Global error handler middleware
// Must have 4 parameters: (err, req, res, next) or Express won't recognize it as error handler
function errorHandler(err, req, res, next) {
  // Extract context from request for logging
  const requestId = req.id || 'unknown';
  const userId = req.userId || 'anonymous';
  const ip = req.ip || req.socket.remoteAddress;

  // Log full error with context for debugging
  // Stack trace helps developers identify where error occurred
  logger.error('Unhandled error', {
    requestId,
    userId,
    ip,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  // Determine HTTP status code
  // If error has statusCode property, use it; otherwise 500 (internal server error)
  const statusCode = err.statusCode || 500;
  
  // Determine message to send to client
  // In production: never expose internal error details (security best practice)
  // In development: show actual error to help debugging
  const message = config.isProduction ? 'Internal server error' : err.message;

  // Send error response with request ID
  // Request ID helps user correlate their error with server logs
  res.status(statusCode).json({
    ok: false,
    error: message,
    requestId,
  });
}

module.exports = errorHandler;
