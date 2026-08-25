/**
 * Shared axios client for chain REST calls. Bare `axios.get(CHAIN_REST + …)`
 * calls scattered across routes each open a fresh connection and never
 * retry a transient 5xx/network blip, so a single slow validator response
 * shows up as a hard failure per-request instead of a brief hiccup.
 *
 * Not yet applied everywhere `axios` talks to CHAIN_REST — see
 * CONTRIBUTING.md's Module Status section. New chain-REST call sites
 * should use this instead of a bare `require('axios')`.
 */
const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('./logger');

const RETRIABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 250;

const chainClient = axios.create({
  timeout: Number(process.env.CHAIN_HTTP_TIMEOUT_MS || 8000),
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(error) {
  if (!error.response) return true; // network error / timeout
  return RETRIABLE_STATUS.has(error.response.status);
}

chainClient.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config || {};
  cfg.__retryCount = cfg.__retryCount || 0;

  if (cfg.__retryCount >= MAX_RETRIES || !isRetriable(error)) {
    return Promise.reject(error);
  }

  cfg.__retryCount += 1;
  logger.warn('chainClient', `retrying chain request (${cfg.__retryCount}/${MAX_RETRIES})`, {
    url: cfg.url,
    error: error.message,
  });
  await sleep(RETRY_DELAY_MS * cfg.__retryCount);
  return chainClient(cfg);
});

module.exports = chainClient;
