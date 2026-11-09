/**
 * Request → device/network description, shared by the session registry
 * (services/sessionRegistry.js) and the login-activity routes.
 *
 * Both of those files used to carry their own near-identical copy of this
 * parsing, which is how they ended up disagreeing about what a session even
 * is. Two deliberate choices in this version:
 *
 *  - No user-agent parsing dependency. A regex table is ~60 lines; a package
 *    is a new supply-chain entry for the sake of a settings panel.
 *  - Anything the request does not actually state comes back as `null`, never
 *    as 'Unknown'. The old code returned `city: 'Unknown'` and
 *    `country: 'Unknown'` and the Settings UI rendered those strings as if
 *    they were location data. A value that was never observed has to stay
 *    absent so the UI can say "not recorded" instead of inventing a place.
 *
 * Still genuinely unavailable (and NOT faked here): city-level geolocation.
 * Nothing in this repo resolves an IP to a location. `cf-ipcountry` is
 * Cloudflare's own edge header and only carries a country code, so country is
 * the most precise thing obtainable until a GeoIP database (MaxMind GeoLite2
 * or similar) is wired into the request path.
 */

// Order matters: Chromium Edge's UA contains both "Edg/" and "Chrome/", and
// every WebKit browser contains "Safari". Checking the most specific token
// first is what keeps Edge from being reported as Chrome.
const BROWSER_TOKENS = [
  { name: 'Edge', pattern: /\b(?:Edg|Edge)\/(\d+(?:\.\d+)?)/ },
  { name: 'Opera', pattern: /\b(?:OPR|OPiOS)\/(\d+(?:\.\d+)?)/ },
  { name: 'Vivaldi', pattern: /\bVivaldi\/(\d+(?:\.\d+)?)/ },
  { name: 'Samsung Internet', pattern: /\bSamsungBrowser\/(\d+(?:\.\d+)?)/ },
  { name: 'Firefox', pattern: /\b(?:Firefox|FxiOS)\/(\d+(?:\.\d+)?)/ },
  { name: 'Chrome', pattern: /\b(?:Chrome|CriOS)\/(\d+(?:\.\d+)?)/ },
  // Safari reports its own version in "Version/", not in the "Safari/" token
  // (which is a frozen engine build, e.g. 605.1.15, on every WebKit browser).
  { name: 'Safari', pattern: /\bVersion\/(\d+(?:\.\d+)?)/ },
];

const OS_TOKENS = [
  { name: 'Windows Phone', pattern: /Windows Phone/i, device: 'mobile' },
  { name: 'iPadOS', pattern: /\biPad\b/i, device: 'tablet' },
  { name: 'iOS', pattern: /\biPhone\b/i, device: 'mobile' },
  { name: 'Android', pattern: /Android/i, device: 'mobile' },
  { name: 'ChromeOS', pattern: /CrOS/i, device: 'desktop' },
  { name: 'macOS', pattern: /Mac OS X|Macintosh/i, device: 'desktop' },
  { name: 'Windows', pattern: /Windows/i, device: 'desktop' },
  { name: 'Linux', pattern: /Linux/i, device: 'desktop' },
];

// Non-browser clients that used to be described as "desktop Chrome" because
// the parser had no other answer. Naming them is the point of recording the
// device at all — a curl request against your account is worth seeing.
const AUTOMATED_PATTERN = /^(curl|wget|python-requests|go-http-client|okhttp|java\/|node|axios|headlesschrome|phantomjs|postmanruntime)/i;

function firstTokenMatch(userAgent) {
  const name = userAgent.split(/[\s/;(]/).find(Boolean);
  return name ? name.slice(0, 40) : null;
}

/**
 * parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/130.0 ... Safari/537.36')
 *   → { device: 'desktop', os: 'Windows', browser: 'Chrome', browserVersion: '130.0' }
 *
 * Every field can be null; callers must treat null as "not stated by the
 * request" rather than a value to display.
 */
function parseUserAgent(rawUserAgent) {
  const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent.trim() : '';
  if (!userAgent) {
    return { device: 'unknown', os: null, browser: null, browserVersion: null, automated: false };
  }

  if (AUTOMATED_PATTERN.test(userAgent)) {
    return {
      device: 'unknown',
      os: null,
      browser: firstTokenMatch(userAgent),
      browserVersion: null,
      automated: true,
    };
  }

  let browser = null;
  let browserVersion = null;
  for (const { name, pattern } of BROWSER_TOKENS) {
    const match = userAgent.match(pattern);
    if (match) {
      browser = name;
      browserVersion = match[1];
      break;
    }
  }

  let os = null;
  // Android is the one OS whose UA also carries a device-class hint that we
  // can't derive from the OS name alone, so tablets stay 'mobile' below.
  let osDevice = null;
  for (const entry of OS_TOKENS) {
    if (entry.pattern.test(userAgent)) {
      os = entry.name;
      osDevice = entry.device;
      break;
    }
  }

  // "Mobile" is the vendor's own declaration and overrides the OS guess: an
  // Android tablet's UA says Android (which maps to 'mobile') while a desktop
  // Chrome on any platform never says Mobile.
  const saysMobile = /\bMobile\b/i.test(userAgent) && !/\bMacintosh\b/i.test(userAgent);
  const saysTablet = /\b(Tablet|iPad)\b/i.test(userAgent);
  let device = 'unknown';
  if (saysTablet) device = 'tablet';
  else if (saysMobile) device = 'mobile';
  else if (osDevice) device = osDevice;
  else if (os) device = osDevice || 'desktop';

  return { device, os, browser, browserVersion, automated: false };
}

/**
 * The client address as this server can actually observe it.
 *
 * req.ip is Express's trust-proxy-aware value (see index.js: `app.set
 * ('trust proxy', …)`), so it already accounts for X-Forwarded-For when a
 * proxy is trusted. req.connection is the fallback for a direct socket.
 * Returns null instead of the old literal 'unknown' so an absent address
 * cannot be mistaken for a real one in the activity log.
 */
function clientIp(req) {
  if (!req) return null;
  const ip = req.ip
    || req.ips?.[0]
    || req.socket?.remoteAddress
    || req.connection?.remoteAddress
    || null;
  if (!ip || typeof ip !== 'string') return null;
  return ip.replace(/^::ffff:/, '');
}

function headerCountry(req) {
  const value = req?.headers?.['cf-ipcountry'];
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  // Cloudflare also sends 'XX' when it could not determine the country.
  if (code.length !== 2 || code === 'XX') return null;
  return code;
}

/**
 * Everything a Session/LoginActivity row needs about the request, in one
 * call. `city` is intentionally null — see the file header.
 */
function requestMeta(req) {
  const raw = (typeof req?.get === 'function' ? req.get('user-agent') : req?.headers?.['user-agent']) || '';
  const parsed = parseUserAgent(raw);
  return {
    ...parsed,
    userAgent: raw ? raw.slice(0, 512) : null,
    ipAddress: clientIp(req),
    country: headerCountry(req),
    city: null,
  };
}

/**
 * "Chrome 130.0" / "Chrome" / null — the shape both the sessions and
 * login-activity responses used to build by hand, differently.
 */
function browserLabel(browser, browserVersion) {
  if (!browser) return null;
  return browserVersion ? `${browser} ${browserVersion}` : browser;
}

module.exports = { parseUserAgent, requestMeta, clientIp, headerCountry, browserLabel };
