/**
 * One place for the two link shapes the Mines flow accepts, because the same
 * strings are written by participants (`proof_url`), by campaign creators
 * (`content_link`) and then rendered as clickable hrefs by reviewers and
 * admins. Validation that lives only in `POST /submissions` is bypassed by
 * `PUT /submissions/:id`, and a value that reaches an <a href> unvalidated is
 * a stored `javascript:` payload firing on whoever reviews the submission —
 * so every write path must consult these and every renderer must reproduce
 * the same allowlist (see frontend src/services/proofLink.ts).
 */

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * A screenshot ref handed back by POST /api/mines/upload:
 * `${userId}-${timestamp}-${sanitizedOriginalName}.(png|jpg|jpeg)`.
 *
 * Anchored at both ends and with no path separator anywhere in it, which
 * matters more than it looks: multer's sanitizeFilename replaces '/' with
 * '_', so a genuine ref never contains one, and without that exclusion a
 * value like `<id>-1730-a/../../../etc/passwd.png` would still match a
 * looser pattern, still pass the `${userId}-` ownership prefix, and then be
 * resolved by `path.join(PROOFS_UPLOAD_DIR, …)` outside the proofs
 * directory — letting a submitter prove that an arbitrary server file exists
 * and claim it as their screenshot.
 */
const LOCAL_PROOF_REF = /^[a-z0-9]{20,}-\d+-[^/\\]*\.(png|jpg|jpeg)$/i;

/** Max length stored for any link-ish field; longer than this is abuse, not a URL. */
const MAX_LINK_LENGTH = 2048;

/**
 * True for a real web URL. Rejects `javascript:`, `data:`, `file:`, bare
 * relative paths and everything else `new URL()` would happily parse —
 * WHATWG URL resolution allows those schemes, so the protocol set is the
 * actual allowlist rather than a prefix regex.
 */
function isSafeExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) return false;
  // A URL with no hostname ("http://") parses fine but opens nothing.
  return !!parsed.hostname;
}

function looksLikeLocalProofRef(value) {
  return typeof value === 'string' && LOCAL_PROOF_REF.test(value);
}

/** Owner check for a local ref: the filename must carry this user's id prefix. */
function localProofRefOwnedBy(value, userId) {
  return looksLikeLocalProofRef(value) && value.startsWith(`${userId}-`);
}

/**
 * Validates a proof_url for storage. Returns the trimmed value, or throws a
 * plain Error whose `message` is safe to show the submitter (routes surface it
 * through badRequest()). `userId` is required because a local ref is only
 * meaningful if the uploading account owns the file.
 */
function assertStorableProofUrl(value, { userId, proofExistsOnDisk }) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) {
    throw new Error('proof_url is required (uploaded screenshot ref or http(s) URL)');
  }
  if (looksLikeLocalProofRef(candidate)) {
    // The regex is anchored, so `candidate` is already a bare filename — a
    // `../../` or `uploads/` prefix never reaches here.
    if (!candidate.startsWith(`${userId}-`)) {
      throw new Error('proof screenshot was not uploaded by this account');
    }
    if (typeof proofExistsOnDisk === 'function' && !proofExistsOnDisk(candidate)) {
      throw new Error('proof screenshot not found on disk — upload via /api/mines/upload first');
    }
    return candidate;
  }
  if (isSafeExternalUrl(candidate)) return candidate;
  throw new Error('proof_url must be either an uploaded screenshot ref or an http(s) URL');
}

/** Validates a campaign creator's content_link before it is published. */
function assertStorableContentLink(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) throw new Error('content_link is required');
  if (!isSafeExternalUrl(candidate)) {
    throw new Error('content_link must be an http(s) URL participants can open');
  }
  return candidate;
}

module.exports = {
  SAFE_URL_PROTOCOLS,
  MAX_LINK_LENGTH,
  isSafeExternalUrl,
  looksLikeLocalProofRef,
  localProofRefOwnedBy,
  assertStorableProofUrl,
  assertStorableContentLink,
};
