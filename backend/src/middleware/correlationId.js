const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to add correlation ID to requests
 * Uses existing X-Correlation-ID header or generates a new one
 */
function correlationId(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}

module.exports = correlationId;
