/**
 * Storage/cookie disclosure notice.
 *
 * This is deliberately a disclosure with a single "Got it" acknowledgement,
 * not an Accept/Reject consent gate: everything the app stores client-side
 * (the session/CSRF cookies express-session sets in backend/src/index.js,
 * and the JWT + preferences this app keeps in localStorage — see
 * src/store/store.ts's OS_KEY) is strictly necessary for the app to
 * function, and none of it is analytics/advertising/tracking. Offering a
 * "Reject" button that couldn't actually change any behavior (there is
 * nothing non-essential to turn off) would be a fake choice, not a real one
 * — so this only needs to inform, per GDPR's general transparency
 * obligation, not gate consent under ePrivacy Article 5(3)'s
 * strictly-necessary exemption.
 */
import { useState } from 'react';

const ACK_KEY = 'mallchain_cookie_notice_ack_v1';

function hasAcknowledged(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) !== null;
  } catch {
    return true; // localStorage unavailable — don't block the UI on it
  }
}

function acknowledge() {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify({ ack: true, ts: new Date().toISOString() }));
  } catch {
    // localStorage unavailable — nothing to persist; banner will just
    // reappear next load, which is the safe failure mode here.
  }
}

export function CookieConsentBanner() {
  const [dismissed, setDismissed] = useState(hasAcknowledged);
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie and storage notice">
      <div className="cookie-notice-body">
        <p>
          🍪 We use strictly necessary cookies and browser storage to keep you signed in and
          remember your preferences — no advertising or analytics tracking.
          <button
            type="button"
            className="banner-learn-more"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show less' : 'Learn more'}
          </button>
        </p>
        {expanded && (
          <div className="banner-detail">
            <p>
              A session cookie and a CSRF cookie (both <code>httpOnly</code>) keep sign-in secure;
              your login token and display preferences (theme, language, etc.) are kept in this
              browser's local storage. None of this is shared with advertisers or used for
              tracking. You can review or delete your account data any time from{' '}
              <a href="#/settings">Settings</a>.
            </p>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-primary cookie-notice-ack"
        onClick={() => { acknowledge(); setDismissed(true); }}
      >
        Got it
      </button>
    </div>
  );
}
