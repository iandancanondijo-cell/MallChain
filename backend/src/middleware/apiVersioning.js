/**
 * API Versioning Middleware
 * Handles /v1/ routing, deprecation headers, and version negotiation
 */

const logger = require('../utils/logger');

// Current stable API version
const CURRENT_VERSION = 'v1';

// Deprecated versions and their sunset dates
const DEPRECATED_VERSIONS = {
  // v0 will be deprecated when v2 launches
};

// Version metadata
const VERSION_INFO = {
  v1: {
    status: 'stable',
    released: '2026-10-04',
    deprecated: null,
    sunset: null,
  },
};

/**
 * Extract API version from request
 * Checks: URL path, Accept header, custom header
 */
function extractVersion(req) {
  // 1. Check URL path (/v1/...)
  const pathMatch = req.path.match(/^\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1];
  }

  // 2. Check custom header (X-API-Version)
  if (req.headers['x-api-version']) {
    return req.headers['x-api-version'];
  }

  // 3. Check Accept header (application/vnd.mallchain.v1+json)
  const accept = req.headers.accept || '';
  const acceptMatch = accept.match(/application\/vnd\.mallchain\.(v\d+)\+json/);
  if (acceptMatch) {
    return acceptMatch[1];
  }

  // Default to current version
  return CURRENT_VERSION;
}

/**
 * Middleware to set API version on request
 */
function apiVersionMiddleware(req, res, next) {
  const version = extractVersion(req);

  // Validate version
  if (!VERSION_INFO[version]) {
    logger.warn('Unknown API version requested', { version, path: req.path });
    return res.status(400).json({
      error: 'unsupported_api_version',
      message: `API version ${version} is not supported`,
      supportedVersions: Object.keys(VERSION_INFO),
      currentVersion: CURRENT_VERSION,
    });
  }

  // Attach version to request
  req.apiVersion = version;

  // Add version info to response headers
  res.set('X-API-Version', version);
  res.set('X-API-Status', VERSION_INFO[version].status);

  // Add deprecation headers if applicable
  const versionInfo = VERSION_INFO[version];
  if (versionInfo.deprecated) {
    res.set('Deprecation', 'true');
    res.set('Sunset', new Date(versionInfo.sunset).toUTCString());
    res.set('Link', `<https://docs.mallchain.io/api/migration>; rel="succession-type"`);

    logger.warn('Deprecated API version used', {
      version,
      path: req.path,
      sunset: versionInfo.sunset,
    });
  }

  next();
}

/**
 * Mark a route as deprecated
 */
function deprecated(options = {}) {
  return (req, res, next) => {
    const message = options.message || `This endpoint is deprecated and will be removed on ${options.sunset || 'a future date'}`;
    const successor = options.successor || null;

    // Add deprecation headers
    res.set('Deprecation', 'true');
    if (options.sunset) {
      res.set('Sunset', new Date(options.sunset).toUTCString());
    }
    if (successor) {
      res.set('Link', `<${successor}>; rel="successor-version"`);
    }

    // Log deprecation warning
    logger.warn('Deprecated endpoint accessed', {
      path: req.path,
      version: req.apiVersion,
      message,
      successor,
    });

    // Optionally add deprecation warning to response body
    if (options.includeWarningInBody !== false) {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (typeof body === 'object' && body !== null) {
          body._deprecation = {
            message,
            sunset: options.sunset,
            successor,
          };
        }
        return originalJson(body);
      };
    }

    next();
  };
}

/**
 * Version-aware route handler
 * Allows different handlers for different API versions
 */
function versionedRoute(handlers) {
  return (req, res, next) => {
    const version = req.apiVersion || CURRENT_VERSION;
    const handler = handlers[version] || handlers.default;

    if (!handler) {
      return res.status(404).json({
        error: 'no_handler_for_version',
        message: `No handler available for API version ${version}`,
      });
    }

    handler(req, res, next);
  };
}

/**
 * Get API version info
 */
function getVersionInfo(version = null) {
  if (version) {
    return VERSION_INFO[version] || null;
  }
  return {
    current: CURRENT_VERSION,
    versions: VERSION_INFO,
    deprecated: Object.keys(DEPRECATED_VERSIONS),
  };
}

/**
 * Middleware to require minimum API version
 */
function requireMinVersion(minVersion) {
  return (req, res, next) => {
    const currentVersion = req.apiVersion || CURRENT_VERSION;
    const currentNum = parseInt(currentVersion.replace('v', ''));
    const minNum = parseInt(minVersion.replace('v', ''));

    if (currentNum < minNum) {
      return res.status(400).json({
        error: 'minimum_version_required',
        message: `This endpoint requires API version ${minVersion} or higher`,
        currentVersion,
        minimumVersion: minVersion,
      });
    }

    next();
  };
}

module.exports = {
  apiVersionMiddleware,
  deprecated,
  versionedRoute,
  getVersionInfo,
  requireMinVersion,
  extractVersion,
  CURRENT_VERSION,
  VERSION_INFO,
  DEPRECATED_VERSIONS,
};
