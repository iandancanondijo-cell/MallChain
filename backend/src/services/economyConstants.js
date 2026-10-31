// Canonical MLPTS (Mallpoints) fiat peg. This is the single source of truth for
// "1 MLPTS = N KES"; every route/service that needs the point price must read it
// here rather than re-deriving `process.env.MALLPOINT_PRICE_KES || 2` (there were
// four divergent copies that drifted apart).
const DEFAULT_MALLPOINT_PRICE_KES = 2

function getMallpointPriceKes() {
  const raw = process.env.MALLPOINT_PRICE_KES
  const n = Number(raw)
  return (raw !== undefined && raw !== '' && !Number.isNaN(n)) ? n : DEFAULT_MALLPOINT_PRICE_KES
}

module.exports = { getMallpointPriceKes, DEFAULT_MALLPOINT_PRICE_KES }
