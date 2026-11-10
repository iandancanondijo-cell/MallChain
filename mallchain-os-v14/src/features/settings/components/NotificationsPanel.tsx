import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from '../../../components/ui';
import './NotificationsPanel.css';
import {
  notificationPreferencesApi,
  COLUMN_LABEL,
  type EffectiveNotifications,
  type NotificationFrequencyValue,
  type NotificationMatrixColumn,
  type NotificationPreferences,
} from '../../../services/notificationPreferencesApi';

/**
 * Notifications — one card, one truth.
 *
 * This page used to carry two independent editors for the same decision. The
 * per-category grid wrote `UserSettings.notifications`, the block below it
 * wrote `NotificationPreferences.channels`, and the dispatcher resolved them as
 * "whichever field exists first" — which meant the coarse per-channel switch
 * (created with email=true the first time the panel loaded) silently overrode
 * every cell in the grid. A cell you had switched off looked off, was stored
 * off, and sent anyway.
 *
 * So the two are now one grid: the column header holds the per-channel switch,
 * the rows hold the per-category cells, and every state shown — including
 * "quiet hours are running right now" and "this category is unsubscribed" —
 * comes from GET /api/notification-preferences/effective, which is computed by
 * backend/src/services/notificationPolicy.js, the same function the senders
 * call. A switch that is not deciding says so instead of lying quietly.
 */

const COLUMNS: NotificationMatrixColumn[] = ['email', 'push', 'sms', 'whatsapp'];

const CATEGORY_LABEL: Record<string, string> = {
  transactions: 'Transactions',
  campaigns: 'Campaigns',
  governance: 'Governance',
  marketing: 'Marketing',
  security: 'Security',
  badgeAlerts: 'Badges',
};

const FREQUENCIES: Array<{ value: NotificationFrequencyValue; label: string }> = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'disabled', label: 'Paused' },
];

/** What the column header switch is worth, in the user's terms. */
function columnCaption(eff: EffectiveNotifications, col: NotificationMatrixColumn): string {
  const meta = eff.channels[col];
  if (!meta) return 'per category';
  if (meta.master === false) return 'all off';
  if (meta.master === null) return 'per category';
  return meta.mode === 'override' ? 'all on' : 'per category';
}

/**
 * What a row cannot show by itself: that it is paused outright. Anything a
 * COLUMN switch decides is stated once, in that column's caption — repeating it
 * on all six rows turned the grid into a wall of warning text.
 */
function rowHints(row: EffectiveNotifications['matrix'][number]): string[] {
  const hints: string[] = [];
  if (row.blockedBy.includes('unsubscribed')) hints.push('Unsubscribed — nothing is sent for this category.');
  if (row.blockedBy.includes('frequency')) hints.push('Paused by its frequency setting.');
  return hints;
}

/**
 * A cell in an 'override' column whose master switch has a value cannot change
 * delivery — the column decides for every row. Those cells show the outcome and
 * are inert, so the grid cannot display a switch that does nothing; flip the
 * column switch and they become editable again.
 */
function columnIsInert(eff: EffectiveNotifications, col: NotificationMatrixColumn): boolean {
  const meta = eff.channels[col];
  return Boolean(meta && meta.mode === 'override' && meta.master !== null);
}

interface Props {
  /** Persists one matrix cell. Owned by the page so one writer per document. */
  onCellChange: (column: NotificationMatrixColumn, category: string, value: boolean) => void | Promise<void>;
}

export function NotificationsPanel({ onCellChange }: Props) {
  const [eff, setEff] = useState<EffectiveNotifications | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (announce?: string) => {
    const res = await notificationPreferencesApi.getEffective();
    if (res.ok && res.data) {
      setEff(res.data);
      setError(null);
    } else {
      setError(res.error || 'Could not load your notification settings.');
    }
    setLoading(false);
    if (announce) toast(announce);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every write goes through this: save, then re-read the merged answer, so a
   *  switch that the server overrode snaps back instead of drifting. */
  async function save(key: string, run: () => Promise<{ ok: boolean; error?: string }>, then?: string) {
    setBusy(key);
    const res = await run();
    if (!res.ok) {
      setBusy(null);
      toast(res.error || 'That change could not be saved.', false);
      await load();
      return;
    }
    await load(then);
    setBusy(null);
  }

  async function toggleChannel(col: NotificationMatrixColumn) {
    if (!eff) return;
    const meta = eff.channels[col];
    if (!meta) return;
    const stored: NotificationPreferences['channels'] = eff.preferenceChannels ?? {
      email: true, push: true, sms: false, whatsapp: false, inApp: true,
    };
    const next = !stored[meta.key];
    await save(
      `channel:${col}`,
      () => notificationPreferencesApi.updateChannels({ ...stored, [meta.key]: next } as NotificationPreferences['channels']),
      `${COLUMN_LABEL[col]} ${next ? 'on' : 'off'} for every category`,
    );
  }

  async function toggleGlobal() {
    if (!eff) return;
    const next = !eff.globalEnabled;
    await save(
      'global',
      () => notificationPreferencesApi.toggleGlobal(next),
      next ? 'Notifications switched back on' : 'All notifications are now off',
    );
  }

  async function setFrequency(category: string, value: NotificationFrequencyValue) {
    if (!eff) return;
    // PATCH /frequency replaces the whole subdoc, so send all six keys back with
    // the one changed instead of letting the others fall to their defaults.
    const frequency: Record<string, NotificationFrequencyValue> = {};
    for (const row of eff.matrix) frequency[row.category] = row.frequency;
    frequency[category] = value;
    await save(
      `freq:${category}`,
      () => notificationPreferencesApi.updateFrequency(frequency as NotificationPreferences['frequency']),
      `${CATEGORY_LABEL[category] ?? category} → ${FREQUENCIES.find((f) => f.value === value)?.label}`,
    );
  }

  async function toggleDnd() {
    if (!eff) return;
    const next = !eff.dnd.enabled;
    await save(
      'dnd',
      () => notificationPreferencesApi.updateDoNotDisturb({
        enabled: next,
        startTime: eff.dnd.startTime || '22:00',
        endTime: eff.dnd.endTime || '07:00',
        timezone: eff.dnd.timezone,
        days: eff.dnd.days,
      }),
      next ? 'Quiet hours on' : 'Quiet hours off',
    );
  }

  async function resubscribe(category: string) {
    await save(
      `unsub:${category}`,
      () => notificationPreferencesApi.resubscribe(category),
      `Subscribed to ${CATEGORY_LABEL[category] ?? category} again`,
    );
  }

  async function toggleCell(col: NotificationMatrixColumn, category: string, value: boolean) {
    setBusy(`cell:${category}:${col}`);
    await onCellChange(col, category, value);
    await load();
    setBusy(null);
  }

  const missingDestination = eff && !eff.gates.phoneOnFile
    ? 'SMS and WhatsApp stay silent until a phone number is verified in "Where notifications are sent".'
    : eff && !eff.gates.whatsappOptIn && eff.channels.whatsapp?.master === true
      ? 'WhatsApp is switched on as a channel, but you have not opted in below — no WhatsApp message is sent.'
      : null;

  return (
    <div className="card mb card-glow bg-gradient-card notif-card">
      <div className="sec-title">
        <h2>Notifications</h2>
        <span className="sub">one switch per channel, one per category — both have to agree</span>
      </div>

      {loading && !eff && <div className="tiny">Loading your notification settings…</div>}

      {!loading && !eff && (
        <div className="flag-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <div className="tiny" style={{ color: 'var(--red)' }}>{error || 'Notification settings could not be loaded.'}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); void load(); }}>Try again</button>
        </div>
      )}

      {eff && (
        <>
          <div className="flag-row">
            <div className="desc">
              <div className="t">All notifications</div>
              <div className="m">
                {eff.globalEnabled
                  ? 'On — the channels and categories below decide what reaches you.'
                  : 'Off — nothing is sent to any channel, whatever the settings below say.'}
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" aria-label="All notifications" checked={eff.globalEnabled} disabled={busy !== null} onChange={() => void toggleGlobal()} />
              <span className="track" /><span className="knob" />
            </label>
          </div>

          <div style={{ overflowX: 'auto', opacity: eff.globalEnabled ? 1 : 0.55 }}>
            <div className="notif-grid">
              <div className="tiny" style={{ color: 'var(--txt-3)', fontWeight: 700 }}>Category and cadence</div>
              {COLUMNS.map((col) => (
                <div key={col} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <div className="tiny notif-col-label" style={{ fontWeight: 700 }}>{COLUMN_LABEL[col]}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        aria-label={`${COLUMN_LABEL[col]} for every category`}
                        checked={eff.preferenceChannels ? eff.preferenceChannels[eff.channels[col].key] : false}
                        disabled={busy !== null}
                        onChange={() => void toggleChannel(col)}
                      />
                      <span className="track" /><span className="knob" />
                    </label>
                  </div>
                  <div className="tiny notif-col-caption" style={{ color: 'var(--txt-3)' }}>{columnCaption(eff, col)}</div>
                </div>
              ))}

              {eff.matrix.map((row) => {
                const hints = rowHints(row);
                return (
                  <Fragment key={row.category}>
                    <div style={{ padding: '6px 0' }}>
                      <div className="notif-row-title" style={{ fontSize: 13, fontWeight: 700 }}>{CATEGORY_LABEL[row.category] ?? row.category}</div>
                      {hints.length > 0 && (
                        <div className="tiny" style={{ color: 'var(--gold)', lineHeight: 1.35 }}>{hints.join(' ')}</div>
                      )}
                      {row.blockedBy.includes('unsubscribed') && (
                        <button
                          className="btn btn-ghost btn-sm notif-resub"
                          style={{ marginTop: 4 }}
                          disabled={busy !== null}
                          onClick={() => void resubscribe(row.category)}
                        >
                          Subscribe again
                        </button>
                      )}
                      <div className="notif-freq-row">
                        <select
                          className="input notif-freq"
                          style={{ width: '100%' }}
                          aria-label={`Frequency for ${CATEGORY_LABEL[row.category] ?? row.category}`}
                          value={row.frequency}
                          disabled={busy !== null}
                          onChange={(e) => void setFrequency(row.category, e.target.value as NotificationFrequencyValue)}
                        >
                          {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {COLUMNS.map((col) => {
                      const cell = row.cells[col];
                      const inert = columnIsInert(eff, col);
                      // An inert column shows what actually goes out, not the
                      // stored value it cannot act on.
                      const shown = cell ? (inert ? cell.on : cell.cell ?? cell.on) : false;
                      const heldByColumn = cell && !cell.on && (cell.decidedBy === 'channel' || cell.decidedBy === 'both');
                      return (
                        <div key={`${row.category}-${col}`} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                          <label
                            className="switch"
                            title={inert
                              ? `The ${COLUMN_LABEL[col]} switch above decides this channel for every category`
                              : heldByColumn ? `Held off by the ${COLUMN_LABEL[col]} switch above` : undefined}
                          >
                            <input
                              type="checkbox"
                              aria-label={`${COLUMN_LABEL[col]} for ${CATEGORY_LABEL[row.category] ?? row.category}`}
                              checked={shown}
                              disabled={busy !== null || inert}
                              style={inert ? { opacity: 0.6 } : undefined}
                              onChange={(e) => void toggleCell(col, row.category, e.target.checked)}
                            />
                            <span className="track" /><span className="knob" />
                          </label>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>

          <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 6 }}>
            Under each channel: “all off” sends nothing for any category, “per category” leaves it to the row
            switches, “all on” sends everything and the rows cannot override it. In-app is the one column that can
            only be turned on or off whole.
          </div>

          <div className="flag-row" style={{ borderBottom: 'none', marginTop: 6 }}>
            <div className="desc">
              <div className="t">
                Quiet hours
                {eff.dnd.active && <span className="chip" style={{ marginLeft: 8, color: 'var(--gold)', borderColor: 'var(--gold)' }}>running now</span>}
              </div>
              <div className="m">
                {eff.dnd.enabled
                  ? `${eff.dnd.startTime}–${eff.dnd.endTime} ${eff.dnd.timezone}. Alerts in the window are skipped, not delivered later.`
                  : 'No quiet window set.'}
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" aria-label="Quiet hours" checked={eff.dnd.enabled} disabled={busy !== null} onChange={() => void toggleDnd()} />
              <span className="track" /><span className="knob" />
            </label>
          </div>

          {missingDestination && (
            <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 6 }}>{missingDestination}</div>
          )}

          {error && (
            <div className="tiny" style={{ color: 'var(--red)', marginTop: 6 }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}
