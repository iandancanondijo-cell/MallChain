import { config } from './config';

/**
 * Turning a stored asset path (currently only avatars — see
 * backend/src/controllers/uploadController.js, which saves `/uploads/<kind>/<file>`
 * on the User document) into something safe to put in an <img src>.
 *
 * Two separate failures live here, and neither is cosmetic:
 *
 * 1. Reachability. A stored path is relative to the *API* origin, not the page
 *    origin. When the SPA is served from anywhere else — including the Vite dev
 *    server, whose proxy only forwards /api — `/uploads/avatars/x.jpg` resolves
 *    against the page and 404s, so a user who uploaded an avatar sees nothing.
 *    `/api/uploads` is mounted for exactly this reason (backend/src/index.js),
 *    so every relative asset path is rewritten onto it and prefixed with the
 *    configured API base when there is one.
 *
 * 2. Scheme. `avatarUrl` is a String field written by an upload route, but it
 *    reaches this component through JSON, and any value can be put in the
 *    document. `javascript:` and other surprising schemes must never become a
 *    src attribute — the same class of bug already fixed once for proof_url.
 */

/** Kinds backend/src/routes/upload.js writes. Anything else is not a path we serve. */
const ASSET_KINDS = ['avatars', 'products', 'store', 'courses', 'badges', 'documents'];

export interface ResolvedAsset {
  /** Usable directly as an <img src>. */
  url: string;
  /** The value the server holds, unchanged — what a re-read is compared against. */
  stored: string;
}

/**
 * A local, pre-upload preview. Deliberately a different function: an object URL
 * is created by this page, exists only for this document, and must never be
 * what gets persisted or sent to the server.
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/**
 * Resolve a server-supplied asset reference, or return null when it is absent,
 * malformed, or not a scheme we are willing to render. null means "show the
 * initials", never "show nothing and hope".
 */
export function resolveAssetUrl(stored: string | null | undefined): ResolvedAsset | null {
  const value = (stored || '').trim();
  if (!value) return null;

  // Absolute http(s) is what a CDN-hosted avatar looks like; everything else
  // that is absolute (javascript:, data:, file:, blob: from another origin) is
  // refused rather than guessed at.
  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { url: parsed.href, stored: value };
  }

  // Relative: must be a root path into the uploads tree, and only the kinds the
  // server actually writes. `..` is excluded by the segment check, so a stored
  // '/../etc/passwd' cannot escape the tree here either.
  if (!value.startsWith('/')) return null;
  const segments = value.split('/').filter(Boolean);
  const kind = segments[0] === 'uploads' ? segments[1] : segments[0] === 'api' && segments[1] === 'uploads' ? segments[2] : '';
  if (!kind || !ASSET_KINDS.includes(kind)) return null;
  if (segments.includes('..') || segments.length < 3) return null;

  const apiPath = value.startsWith('/api/') ? value : `/api${value}`;
  return { url: `${config.apiBaseUrl}${apiPath}`, stored: value };
}
