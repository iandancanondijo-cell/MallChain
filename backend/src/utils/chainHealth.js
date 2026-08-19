/**
 * Pure staleness computation for chain liveness checks, split out of
 * index.js's checkChainHealth() so it's unit-testable without needing to
 * boot the whole Express app: a REST endpoint that responds but keeps
 * returning the same old block (validator down, consensus stuck) must be
 * distinguished from a genuinely healthy, advancing chain.
 */
function computeBlockStaleness(latestBlockTime, staleThresholdMs, now = Date.now()) {
  if (!latestBlockTime) {
    return { blockAgeMs: null, isStale: false };
  }
  const blockAgeMs = now - new Date(latestBlockTime).getTime();
  return { blockAgeMs, isStale: blockAgeMs > staleThresholdMs };
}

module.exports = { computeBlockStaleness };
