// Canonical MLPTS (Mallpoints) fiat peg. This is the single source of truth for
// "1 MLPTS = N KES"; every route/service that needs the point price must read it
// here rather than re-deriving `process.env.MALLPOINT_PRICE_KES || 2` (there were
// four divergent copies that drifted apart).
const DEFAULT_MALLPOINT_PRICE_KES = 2

function readPeg() {
  const raw = process.env.MALLPOINT_PRICE_KES
  const n = Number(raw)
  const configured = raw !== undefined && raw !== '' && !Number.isNaN(n)
  return {
    kes: configured ? n : DEFAULT_MALLPOINT_PRICE_KES,
    // 'environment' — a deployment moved off the default and the number on
    // screen is that deployment's choice. 'default' — nobody set
    // MALLPOINT_PRICE_KES and this is the value the source says. A public
    // price endpoint has to be able to tell the two apart; a caller reading
    // "2" cannot know whether it is configured or merely unbudged.
    source: configured ? 'environment' : 'default',
  }
}

function getMallpointPriceKes() {
  return readPeg().kes
}

/**
 * The same number with its provenance: `{ kes, source }`, where `source` is
 * 'environment' when `MALLPOINT_PRICE_KES` is set to a usable value and
 * 'default' when it is not. Read it here rather than re-testing the
 * environment variable — that check is this file's job.
 */
function getMallpointPeg() {
  return readPeg()
}

module.exports = { getMallpointPriceKes, getMallpointPeg, DEFAULT_MALLPOINT_PRICE_KES }
