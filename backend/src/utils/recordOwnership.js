/**
 * Decides whether the caller of a status endpoint may see the identity fields
 * (phone, wallet/seller address) stored on a record.
 *
 * The buy/sell/withdraw status routes are address-keyed relay endpoints with
 * no auth middleware by design, yet their responses carried a user's phone
 * number and wallet address to anyone holding the record id. The ids are
 * 96-bit random so not enumerable, but a link pasted in support chat or a
 * browser-history leak is enough. Optional auth lets the owner keep the full
 * payload while every other caller gets the state without the identity.
 */
function ownsRecord(viewer, record) {
  if (!viewer || !record) return false;

  if (viewer.role === 'admin' || viewer.role === 'superadmin') return true;

  if (viewer.walletAddress) {
    if (record.walletAddress && viewer.walletAddress === record.walletAddress) return true;
    if (record.sellerAddress && viewer.walletAddress === record.sellerAddress) return true;
    if (record.from && viewer.walletAddress === record.from) return true;
  }

  if (viewer.phone && record.phone && viewer.phone === record.phone) return true;

  return false;
}

// The identity fields the status payloads carried to any holder of a record
// id. Kept as one list so a new summary builder cannot silently widen it.
const IDENTITY_FIELDS = ['phone', 'walletAddress', 'sellerAddress', 'from'];

/**
 * Copy of `summary` with the identity fields removed, for callers that do not
 * own the record. The status/state fields are left intact — the whole point of
 * these routes is that a guest can poll a checkout.
 */
function redactIdentity(summary) {
  if (!summary || typeof summary !== 'object') return summary;

  const out = { ...summary };
  for (const field of IDENTITY_FIELDS) {
    if (out[field] !== undefined) out[field] = null;
  }
  return out;
}

module.exports = { ownsRecord, redactIdentity, IDENTITY_FIELDS };
