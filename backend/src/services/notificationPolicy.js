/**
 * Notification preference policy — the one merge every caller reads.
 *
 * Two documents decide whether a notification goes out, and both are edited
 * from the same Settings page:
 *
 *   NotificationPreferences.channels.<channel>       one switch per channel
 *   UserSettings.notifications.<channel>.<category>   one switch per channel × category
 *
 * Until now the engine resolved them as `channels.X ?? matrix ?? default`, so
 * the coarse switch REPLACED the per-category one. A NotificationPreferences row
 * is created the first time the notifications panel loads and its email/inApp
 * defaults are true, which turned every "off" cell in the Settings matrix into a
 * decoration: switching off "Security → email" changed nothing, and the panel
 * had no way to say so. Here the coarse switch is a gate ANDed with the cell, so
 * either one being off holds the notification back and both panels describe the
 * same outcome.
 *
 * inApp keeps the older override on purpose: its matrix column is `push`, which
 * the schema defaults to false for governance and marketing, so AND-ing it would
 * strip live in-app notices from accounts that never asked for that. For that
 * column the master switch genuinely decides, and `decidedBy` says so instead of
 * pretending the cell does.
 *
 * Every resolution here can only ever hold a notification back or leave it as it
 * was — never deliver on a channel both documents did not already allow.
 */

const NOTIFICATION_CHANNELS = ['email', 'push', 'sms', 'whatsapp'];

// The row order both panels render, and the frequency keys NotificationPreferences
// stores — the same six the model enumerates.
const MATRIX_CATEGORIES = ['transactions', 'campaigns', 'governance', 'marketing', 'security', 'badgeAlerts'];

const CHANNEL_DEFS = [
  // `key` is what the dispatchers consume, `matrixKey` the column the per-category
  // document stores. `defaultOn` matches the fallback each channel had before this
  // module existed, so an account with neither document resolves as it used to.
  //
  // Note `inApp`/`push`: NotificationPreferences.channels has BOTH a `push` and an
  // `inApp` boolean and no dispatcher anywhere reads `push` — the notifications
  // panel used to render a "push" switch that could not change anything. The
  // in-app column is the `inApp` field, and it reads the matrix's `push` row.
  { key: 'email', matrixKey: 'email', defaultOn: true, mode: 'gate' },
  { key: 'sms', matrixKey: 'sms', defaultOn: false, mode: 'gate' },
  { key: 'whatsapp', matrixKey: 'whatsapp', defaultOn: false, mode: 'gate' },
  { key: 'inApp', matrixKey: 'push', defaultOn: true, mode: 'override' },
];

const CATEGORY_MAP = {
  account: 'security',
  wallet: 'transactions',
  transaction: 'transactions',
  mlcns: 'transactions',
  mlpts: 'campaigns',
  campaign: 'campaigns',
  mining: 'campaigns',
  marketplace: 'transactions',
  badge: 'badgeAlerts',
  badges: 'badgeAlerts',
  network: 'security',
  security: 'security',
  governance: 'governance',
  administration: 'security',
  // 'system' is not a frequency key, so support events resolve to no stored
  // frequency and go out immediately. Kept because it is what the engine did
  // before this module existed; changing it would make a security-frequency
  // "disabled" setting start swallowing support messages.
  support: 'system',
  system: 'security',
  marketing: 'marketing',
  referrals: 'campaigns',
  badgeAlerts: 'badgeAlerts',
  transactions: 'transactions',
  campaigns: 'campaigns',
};

function categoryToFrequencyKey(category) {
  return CATEGORY_MAP[category] || 'security';
}

/**
 * Resolve one channel for one category.
 *
 * `master`/`cell` are the raw stored booleans (undefined when the document or
 * field is absent — absent is not the same as false, it means "no opinion"), and
 * the result explains itself so a panel can name the switch that is deciding:
 *   on        whether the channel may be used for this category right now
 *   decidedBy 'channel' | 'category' | 'both' | 'default' | null (null = on, nothing blocking)
 */
function decideChannel(def, master, cell) {
  const hasMaster = typeof master === 'boolean';
  const hasCell = typeof cell === 'boolean';

  let on;
  if (def.mode === 'override') {
    on = hasMaster ? master : (hasCell ? cell : def.defaultOn);
  } else {
    on = (hasMaster ? master : true) && (hasCell ? cell : def.defaultOn);
  }

  let decidedBy = null;
  if (def.mode === 'override') {
    if (hasMaster) decidedBy = 'channel';
    else if (hasCell) decidedBy = 'category';
    else decidedBy = 'default';
  } else if (!on) {
    if (master === false && cell === false) decidedBy = 'both';
    else if (master === false) decidedBy = 'channel';
    else if (cell === false) decidedBy = 'category';
    else decidedBy = 'default';
  }

  return {
    on,
    master: hasMaster ? master : null,
    cell: hasCell ? cell : null,
    decidedBy,
  };
}

/**
 * Merge both documents for one frequency key.
 *
 * @returns {{channels: Object, detail: Object}} `channels` is the flat
 *   {email, sms, whatsapp, inApp} booleans the dispatchers switch on; `detail`
 *   is the same answer with the reasoning attached, keyed by matrix column.
 */
function mergeChannels(prefs, userSettings, freqKey) {
  const channels = {};
  const detail = {};
  for (const def of CHANNEL_DEFS) {
    const decision = decideChannel(
      def,
      prefs?.channels?.[def.key],
      userSettings?.notifications?.[def.matrixKey]?.[freqKey],
    );
    channels[def.key] = decision.on;
    detail[def.matrixKey] = decision;
  }
  return { channels, detail };
}

/** Both documents are optional and both fail open: a collection that is
 *  unreachable must not swallow the user's notifications, and an absent
 *  document means "no opinion", not "off" — see decideChannel(). */
async function readNotificationPreferences(userId) {
  const NotificationPreferences = require('../models/notificationPreferences');
  try {
    return await NotificationPreferences.findOne({ userId }).lean();
  } catch (error) {
    require('../utils/logger').warn('notificationPolicy', 'NotificationPreferences unreadable', {
      userId: String(userId), error: error.message,
    });
    return null;
  }
}

async function readUserNotificationSettings(userId) {
  const UserSettings = require('../models/UserSettings');
  try {
    // Only the two sections this policy reads. The same document also holds the
    // verification phone number, backup email and hashed OTPs — no reason to
    // carry those into every notification dispatch.
    return await UserSettings.findOne({ userId }).select('notifications contactInfo').lean();
  } catch (error) {
    require('../utils/logger').warn('notificationPolicy', 'UserSettings unreadable', {
      userId: String(userId), error: error.message,
    });
    return null;
  }
}

async function readPreferenceDocs(userId) {
  const [prefs, userSettings] = await Promise.all([
    readNotificationPreferences(userId),
    readUserNotificationSettings(userId),
  ]);
  return { prefs, userSettings };
}

function isWithinDND(dnd, now = new Date()) {
  if (!dnd?.enabled) return false;
  if (!dnd.startTime || !dnd.endTime) return false;

  const tz = dnd.timezone || 'Africa/Nairobi';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const currentHour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const currentMinute = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  const currentDay = parts.find((p) => p.type === 'weekday').value.toUpperCase();

  const [startHour, startMinute] = dnd.startTime.split(':').map(Number);
  const [endHour, endMinute] = dnd.endTime.split(':').map(Number);

  const currentMinutes = currentHour * 60 + currentMinute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const dayMatch = !dnd.days || dnd.days.length === 0 || dnd.days.includes(currentDay);
  if (!dayMatch) return false;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Everything the notification panels claim, resolved by the same code the
 * dispatchers use — so what a switch says it does and what it does cannot drift
 * apart again.
 */
async function effectiveNotificationMatrix(userId, { docs, now, hasEmail } = {}) {
  const source = docs || (await readPreferenceDocs(userId));
  const { prefs, userSettings } = source;

  const unsubscribed = prefs?.unsubscribedCategories ?? [];
  const dnd = prefs?.doNotDisturb;
  const dndActive = isWithinDND(dnd, now);

  const matrix = MATRIX_CATEGORIES.map((category) => {
    const { channels, detail } = mergeChannels(prefs, userSettings, category);
    const frequency = prefs?.frequency?.[category] ?? 'immediate';
    const blockedBy = [];
    if (frequency === 'disabled') blockedBy.push('frequency');
    if (unsubscribed.includes(category)) blockedBy.push('unsubscribed');
    return {
      category,
      frequency,
      blockedBy,
      cells: detail,
      // Kept for dispatchers that want the flat answer for this row.
      channels,
    };
  });

  const master = {};
  for (const def of CHANNEL_DEFS) {
    const stored = prefs?.channels?.[def.key];
    master[def.matrixKey] = {
      key: def.key,
      mode: def.mode,
      // What the coarse switch holds; null means no NotificationPreferences row
      // (or no value in it) so the per-category cells are deciding alone.
      master: typeof stored === 'boolean' ? stored : null,
    };
  }

  return {
    globalEnabled: prefs?.enableNotifications ?? true,
    dnd: {
      enabled: dnd?.enabled ?? false,
      active: dndActive,
      startTime: dnd?.startTime ?? null,
      endTime: dnd?.endTime ?? null,
      timezone: dnd?.timezone ?? 'Africa/Nairobi',
      days: dnd?.days ?? [],
    },
    unsubscribedCategories: unsubscribed,
    channels: master,
    // The coarse subdoc exactly as stored, so a panel can PATCH it back with one
    // key changed. PATCH /channels replaces the whole subdoc, and a payload that
    // omits a key gets the schema default — which is how "turn email off" could
    // silently turn SMS off too.
    preferenceChannels: prefs?.channels ? { ...prefs.channels } : null,
    matrix,
    // Delivery needs a destination, not just a switched-on preference. Never
    // echo the address or the number back — the panel only needs to know.
    gates: {
      emailOnFile: typeof hasEmail === 'boolean' ? hasEmail : null,
      phoneOnFile: Boolean(userSettings?.contactInfo?.phoneNumber),
      phoneVerified: Boolean(userSettings?.contactInfo?.phoneVerified),
      whatsappOptIn: Boolean(userSettings?.contactInfo?.whatsappOptIn),
    },
    hasPreferenceDocument: Boolean(prefs),
    hasSettingsDocument: Boolean(userSettings),
  };
}

module.exports = {
  CHANNEL_DEFS,
  NOTIFICATION_CHANNELS,
  MATRIX_CATEGORIES,
  categoryToFrequencyKey,
  decideChannel,
  mergeChannels,
  readPreferenceDocs,
  readNotificationPreferences,
  readUserNotificationSettings,
  isWithinDND,
  effectiveNotificationMatrix,
};
