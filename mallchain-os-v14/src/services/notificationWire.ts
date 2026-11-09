/**
 * The notification wire format, in one place.
 *
 * Two producers send this shape and neither uses this client's field names:
 * - REST rows — `models/Notification.js` (`type`, `message`)
 * - socket pushes — `services/notificationEngine.js`'s deliverInApp/notify,
 *   which emit `{_id, type, title, message, read, createdAt}` on the
 *   'notification' event
 *
 * Both UIs used to build live-push rows straight off the socket payload with
 * `n.kind`/`n.body`, so every real-time notification rendered with an
 * undefined title-field and no body. One mapper, owned by nobody's transport,
 * means that cannot happen again — and it lets the socket layer stay free of
 * an import cycle through the API service.
 */

/**
 * The seven values `models/Notification.js`'s `type` enum actually accepts.
 * Anything the client shows or filters on must be one of these — the old UI
 * filtered on `wallet`/`mines`/`validators`, which no stored row can ever have
 * had, so those tabs were permanently empty by construction.
 */
export const NOTIF_KINDS = [
  'transaction',
  'security',
  'governance',
  'campaign',
  'badge',
  'marketing',
  'system',
] as const;

export type NotifKind = (typeof NOTIF_KINDS)[number];

/** Label for the server's `type` value, for headings and filter chips. */
export const NOTIF_KIND_LABEL: Record<NotifKind, string> = {
  transaction: 'Transactions',
  security: 'Security',
  governance: 'Governance',
  campaign: 'Campaigns',
  badge: 'Badges',
  marketing: 'Marketing',
  system: 'System',
};

export interface AppNotification {
  _id: string;
  kind: NotifKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  /** Structured payload the row was created with (tx hash, amount, …). */
  data?: Record<string, unknown>;
}

export function isNotifKind(value: unknown): value is NotifKind {
  return typeof value === 'string' && (NOTIF_KINDS as readonly string[]).includes(value);
}

/**
 * Normalize either wire shape into an AppNotification. An unknown `type`
 * becomes 'system' rather than an empty chip, because the backend's own
 * dispatcher falls back the same way — a row created before an enum value was
 * added still has to render.
 */
export function normalizeNotification(raw: Record<string, unknown>): AppNotification {
  const type = raw.type ?? raw.kind;
  const created = raw.createdAt ?? raw.occurredAt;
  let createdAt = '';
  if (typeof created === 'string') createdAt = created;
  else if (created instanceof Date) createdAt = created.toISOString();
  else if (typeof created === 'number') createdAt = new Date(created).toISOString();
  else createdAt = new Date().toISOString();

  return {
    _id: String(raw._id ?? raw.id ?? ''),
    kind: isNotifKind(type) ? type : 'system',
    title: String(raw.title ?? ''),
    body: String(raw.message ?? raw.body ?? ''),
    read: !!(raw as { read?: boolean }).read,
    createdAt,
    data: (raw.data as Record<string, unknown>) || undefined,
  };
}
