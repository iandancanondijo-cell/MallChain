/**
 * Turns the link-shaped strings the Mines flow stores — a participant's
 * `proof_url` and a campaign's `content_link` — into something that is safe to
 * render as an href, or tells the caller it must not be one.
 *
 * Mirrors backend/src/utils/linkPolicy.js. The backend allowlists on write, but
 * rows written before that existed are still in the database, and these same
 * strings are opened by reviewers and admins. A single `<a href={proof_url}>`
 * with a stored `javascript:` payload fires as that reviewer's own session —
 * so the renderer, not just the writer, has to decide what is clickable.
 */
import { config } from './config';

export type OpenableLink =
  /** A real web URL — open in a new tab. */
  { kind: 'external'; href: string; label: string }
  /** A screenshot ref from POST /api/mines/upload — served back by GET /api/mines/proof/:ref. */
  | { kind: 'upload'; href: string; label: string };

/**
 * Nothing clickable: empty, or a value the allowlist refuses.
 *
 * `display` is always a fixed human label, never the stored value. Printing the
 * raw string is what a participant-facing panel looks like when it shows
 * `javascript:alert(document.cookie)` as text — escaped by React, harmless, but
 * it reads as a live attack and it leaks whatever a creator pasted. The value
 * belongs in `raw`, which callers surface as a tooltip for whoever has to clean
 * the row up.
 */
export type BlockedLink = { kind: 'none'; reason: string; display: string; raw?: string };

export type ProofLink = OpenableLink | BlockedLink;
/** A campaign's task link is never an uploaded screenshot, so it only has two outcomes. */
export type ContentLink = { kind: 'external'; href: string; label: string } | BlockedLink;

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * `${userId}-${timestamp}-${name}.png|jpg|jpeg` — same shape the backend
 * accepts. No path separator is allowed anywhere in it, so a value can never
 * resolve outside the proofs directory.
 */
const LOCAL_PROOF_REF = /^[a-z0-9]{20,}-\d+-[^/\\]*\.(png|jpg|jpeg)$/i;

const MAX_LINK_LENGTH = 2048;

function parseSafeUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.hostname ? parsed : null;
}

function hostLabel(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/** A campaign's task link: only ever http(s), never a stored scheme payload. */
export function resolveContentLink(value?: string | null): ContentLink {
  const url = value ? parseSafeUrl(value) : null;
  if (url) return { kind: 'external', href: url.toString(), label: hostLabel(url) };
  if (value && value.trim()) {
    return { kind: 'none', reason: 'This campaign published a link that is not an http(s) address, so it is not clickable.', display: 'Task link can’t be opened', raw: value.trim().slice(0, 120) };
  }
  return { kind: 'none', reason: 'No task link was published for this campaign.', display: '' };
}

/**
 * A submission proof: either an uploaded screenshot ref (re-fetched through
 * the authenticated /api/mines/proof route) or an external URL.
 */
export function resolveProofLink(value?: string | null): ProofLink {
  const trimmed = (value || '').trim();
  if (!trimmed) return { kind: 'none', reason: 'No proof was attached to this submission.', display: '' };

  if (LOCAL_PROOF_REF.test(trimmed)) {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    return {
      kind: 'upload',
      // The ref is a filename, and encodeURIComponent keeps it as exactly one
      // path segment whatever characters the original capture name had.
      href: `${base}/api/mines/proof/${encodeURIComponent(trimmed)}`,
      label: trimmed.split('-').slice(2).join('-') || 'screenshot',
    };
  }

  const url = parseSafeUrl(trimmed);
  if (url) return { kind: 'external', href: url.toString(), label: hostLabel(url) };

  return {
    kind: 'none',
    reason: 'This proof is not an uploaded screenshot or an http(s) link, so it is not clickable.',
    display: 'Proof can’t be opened',
    raw: trimmed.slice(0, 120),
  };
}

/**
 * Client mirror of linkPolicy.pointsAtSpecificContent: does the address name
 * one piece of content, or the app itself?
 *
 * This is a product-quality rule, not a security one — `resolveContentLink`
 * stays the only gate on what may receive an href. The backend refuses to
 * publish `https://instagram.com` as a task because a campaign pays for a
 * specific action and a bare home page tells nobody which one; every real
 * share link (instagram.com/p/…, x.com/…/status/…, youtu.be/…) carries a path.
 *
 * The scheme is checked before the path is read because `new
 * URL('javascript:alert(1)')` has a pathname, and a predicate that a form
 * reuses for a friendly hint must not describe that as specific content.
 */
export function pointsAtSpecificContent(value?: string | null): boolean {
  const url = value ? parseSafeUrl(value) : null;
  if (!url) return false;
  const path = url.pathname.replace(/\/+$/, '');
  return path.length > 0 && path !== '/';
}

/**
 * Warning for a link that is safe to open but useless as a task, or null.
 * `resolveContentLink` is silent about this case on purpose — reviewers still
 * need to open whatever the creator published.
 */
export function specificContentWarning(value?: string | null): string | null {
  if (!value || !parseSafeUrl(value)) return null;
  if (pointsAtSpecificContent(value)) return null;
  const url = parseSafeUrl(value) as URL;
  return `That is the ${hostLabel(url)} home page. Participants are paid for one specific action, so publish the exact post, video, reel or profile they should open.`;
}

/** Client-side mirror of the backend's write rules, used to reject before uploading. */
export function isStorableProof(value: string): boolean {
  const trimmed = value.trim();
  return LOCAL_PROOF_REF.test(trimmed) || parseSafeUrl(trimmed) !== null;
}

/**
 * Tooltip for a blocked row. The visible label stays generic, but the person
 * who has to fix the stored row still needs to see what is actually in it.
 */
export function blockedLinkTitle(link: BlockedLink): string {
  return link.raw ? `${link.reason} Stored value: ${link.raw}` : link.reason;
}
