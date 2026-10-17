/**
 * ReportsAdmin — the reports channel between category admins and the
 * superadmin. Two sides in one component, switched by role:
 *
 *   Sender (category admin):
 *     - Compose a new report (subject + body)
 *     - List of own reports with sender-side status pills
 *     - Status colours:
 *         grey   → superadmin offline (no one to read it yet)
 *         orange → superadmin online, but the report hasn't been opened
 *         blue   → superadmin has opened it
 *         green  → marked "to be acted upon"
 *
 *   Receiver (superadmin):
 *     - Inbox of every report from every category
 *     - "Mark read" toggles status from orange → blue
 *     - "Mark actioned" (with optional reply) toggles blue → green
 *
 * Presence is polled every 20s via GET /api/admin/presence, which returns
 * the superadmin's lastSeenAt. The receiver (superadmin) keeps their own
 * lastSeenAt fresh via requireAuth.js's throttled update; that's how the
 * sender knows they're online without any socket plumbing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../../../services/adminApi';
import type { PresenceState, ReportRecord } from '../../../services/adminApi';
import { Modal, toast } from '../../../components/ui';
import { store } from '../../../store/store';

type Color = 'grey' | 'orange' | 'blue' | 'green';

const PRESENCE_POLL_MS = 20_000;

function classify(rep: ReportRecord, presence: PresenceState | null): Color {
  if (rep.status === 'actioned') return 'green';
  if (rep.status === 'read') return 'blue';
  if (!presence?.superadminOnline) return 'grey';
  return 'orange';
}

const COLOR_STYLE: Record<Color, { label: string; bg: string; fg: string }> = {
  grey:   { label: 'grey · super admin offline',         bg: 'rgba(120, 120, 130, 0.18)', fg: '#9aa0a6' },
  orange: { label: 'orange · online, awaiting read',     bg: 'rgba(245, 158, 11, 0.20)',   fg: '#fb923c' },
  blue:   { label: 'blue · read',                        bg: 'rgba(59, 130, 246, 0.22)',   fg: '#60a5fa' },
  green:  { label: 'green · marked to be acted upon',    bg: 'rgba(34, 197, 94, 0.22)',    fg: '#4ade80' },
};

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function ReportsAdmin() {
  const me = store.state.user;
  const isSuper = me.role === 'superadmin';

  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [presence, setPresence] = useState<PresenceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [actionTarget, setActionTarget] = useState<ReportRecord | null>(null);
  const [actionReply, setActionReply] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Latest-load guard for /reports — presence polls should never stomp
  // on a fresh submit.
  const loadSeq = useRef(0);

  const loadReports = useCallback(async () => {
    const seq = ++loadSeq.current;
    const r = await adminApi.listReports();
    if (seq !== loadSeq.current) return; // newer load already in flight
    if (r.ok && r.data) setReports(r.data.reports);
  }, []);

  const loadPresence = useCallback(async () => {
    const r = await adminApi.getPresence();
    if (r.ok && r.data) setPresence(r.data);
  }, []);

  // Initial: reports + presence. Polls:
  //   - presence every 20s (drives sender-side grey/orange colour swap)
  //   - reports every 25s (drives blue/green colour swap when superadmin
  //     marks them — without polling the sender's pills wouldn't update
  //     until they navigated away)
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadReports(), loadPresence()]);
      setLoading(false);
    })();

    const presenceId = setInterval(() => void loadPresence(), PRESENCE_POLL_MS);
    const reportsId = setInterval(() => void loadReports(), PRESENCE_POLL_MS + 5000);
    return () => {
      clearInterval(presenceId);
      clearInterval(reportsId);
    };
  }, [loadReports, loadPresence]);

  const submit = async () => {
    if (!subject.trim() || !body.trim()) {
      toast('Subject and body are required', false);
      return;
    }
    const r = await adminApi.submitReport({ subject: subject.trim(), body: body.trim() });
    if (r.ok && r.data) {
      toast('Report sent');
      setShowCompose(false);
      setSubject('');
      setBody('');
      void loadReports();
    } else {
      toast(r.error || 'Failed to send report', false);
    }
  };

  const markRead = async (id: string) => {
    setBusy(id);
    const r = await adminApi.markReportRead(id);
    setBusy(null);
    if (r.ok) {
      void loadReports();
    } else {
      toast(r.error || 'Failed to mark read', false);
    }
  };

  const markActioned = async () => {
    if (!actionTarget) return;
    setBusy(actionTarget._id);
    const r = await adminApi.markReportActioned(actionTarget._id, actionReply.trim() || undefined);
    setBusy(null);
    if (r.ok) {
      toast('Marked for action');
      setActionTarget(null);
      setActionReply('');
      void loadReports();
    } else {
      toast(r.error || 'Failed', false);
    }
  };

  return (
    <div style={{ padding: '0 0 32px' }}>
      {/* Presence strip — visible to both sides. Same data drives the
          sender-side colour classification. */}
      <PresenceStrip presence={presence} />

      {/* Sender / receiver switch is implicit on role: superadmin sees
          the inbox; category admins see compose + their own list. */}
      {isSuper ? (
        <SuperadminInbox
          reports={reports}
          presence={presence}
          loading={loading}
          onMarkRead={(id) => void markRead(id)}
          onMarkActioned={(r) => {
            setActionTarget(r);
            setActionReply('');
          }}
          busy={busy}
        />
      ) : (
        <SenderView
          reports={reports}
          presence={presence}
          loading={loading}
          onCompose={() => setShowCompose(true)}
          onMarkRead={(id) => void markRead(id)}
          onMarkActioned={(r) => {
            setActionTarget(r);
            setActionReply('');
          }}
          busy={busy}
        />
      )}

      {showCompose && (
        <Modal title="Send report to super admin" onClose={() => setShowCompose(false)}>
          <p style={{ fontSize: 13, color: 'var(--txt-3)' }}>
            Reports are visible only to the super admin. They get a clear visual
            indicator of whether anyone is online to read them.
          </p>
          <input
            className="input mt"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="input mt"
            rows={6}
            placeholder="Describe the situation in detail…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowCompose(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void submit()}>
              Send
            </button>
          </div>
        </Modal>
      )}

      {actionTarget && (
        <Modal title="Mark for action" onClose={() => setActionTarget(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--txt-2)' }}>
            Mark <b>{actionTarget.subject}</b> as to be acted upon? The sender will see
            a green indicator. You can include a short reply.
          </p>
          <textarea
            className="input mt"
            rows={3}
            placeholder="Reply (optional)…"
            value={actionReply}
            onChange={(e) => setActionReply(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setActionTarget(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void markActioned()}
              disabled={busy === actionTarget._id}
            >
              Mark for action
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PresenceStrip({ presence }: { presence: PresenceState | null }) {
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: 999,
            background: presence?.superadminOnline ? '#4ade80' : '#6b7280',
            boxShadow: presence?.superadminOnline
              ? '0 0 8px rgba(74, 222, 128, 0.8)'
              : 'none',
          }}
        />
        <span style={{ fontWeight: 600 }}>
          {presence?.superadminOnline ? 'Super admin online' : 'Super admin offline'}
        </span>
        <span className="tiny" style={{ color: 'var(--txt-3)' }}>
          {presence?.superadminOnline
            ? `last activity ${timeAgo(presence.lastSeenAt || undefined)}`
            : presence?.lastSeenAt
              ? `last seen ${timeAgo(presence.lastSeenAt)} by ${presence.lastSeenEmail || 'unknown'}`
              : 'no super admin has signed in yet'}
        </span>
      </div>
    </div>
  );
}

function StatusPill({ color, custom }: { color: Color; custom?: string }) {
  const s = COLOR_STYLE[color];
  return (
    <span
      title={s.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.fg}55`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 999,
          background: s.fg,
        }}
      />
      {custom ?? s.label}
    </span>
  );
}

function ReportCard({
  r,
  color,
  isSuper,
  onMarkRead,
  onMarkActioned,
  busy,
}: {
  r: ReportRecord;
  color: Color;
  isSuper: boolean;
  onMarkRead: (id: string) => void;
  onMarkActioned: (r: ReportRecord) => void;
  busy: string | null;
}) {
  const expanded = useMemo(() => r.body.length < 220, [r.body]);
  return (
    <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{r.subject}</div>
          <div className="m tiny" style={{ wordBreak: 'break-word' }}>
            {expanded ? r.body : `${r.body.slice(0, 200)}…`}
          </div>
          <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>category: <b style={{ color: 'var(--txt-1)' }}>{r.fromCategory}</b></span>
            <span>sent {timeAgo(r.createdAt)}</span>
            {r.readAt && <span>read {timeAgo(r.readAt)}</span>}
            {r.actionedAt && <span>actioned {timeAgo(r.actionedAt)}</span>}
          </div>
          {r.superadminReply && (
            <div className="card" style={{ marginTop: 8, padding: 10, fontSize: 12.5 }}>
              <div className="tiny" style={{ color: 'var(--txt-3)', marginBottom: 4 }}>super admin reply</div>
              {r.superadminReply}
            </div>
          )}
        </div>
        <StatusPill color={color} />
      </div>

      {isSuper && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {r.status === 'sent' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onMarkRead(r._id)}
              disabled={busy === r._id}
            >
              Mark read
            </button>
          )}
          {r.status !== 'actioned' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onMarkActioned(r)}
              disabled={busy === r._id}
            >
              Mark for action
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SuperadminInbox({
  reports,
  presence,
  loading,
  onMarkRead,
  onMarkActioned,
  busy,
}: {
  reports: ReportRecord[];
  presence: PresenceState | null;
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkActioned: (r: ReportRecord) => void;
  busy: string | null;
}) {
  return (
    <div className="card mt">
      <div className="sec-title">
        <h2>All reports</h2>
        <span className="sub">{reports.length} reports · every category admin</span>
      </div>
      {loading && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>loading.........</div>}
      {!loading && reports.length === 0 && (
        <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
          No reports yet. When a category admin sends one, it will appear here.
        </div>
      )}
      {reports.map((r) => (
        <ReportCard
          key={r._id}
          r={r}
          color={classify(r, presence)}
          isSuper
          onMarkRead={onMarkRead}
          onMarkActioned={onMarkActioned}
          busy={busy}
        />
      ))}
    </div>
  );
}

function SenderView({
  reports,
  presence,
  loading,
  onCompose,
  onMarkRead,
  onMarkActioned,
  busy,
}: {
  reports: ReportRecord[];
  presence: PresenceState | null;
  loading: boolean;
  onCompose: () => void;
  onMarkRead: (id: string) => void;
  onMarkActioned: (r: ReportRecord) => void;
  busy: string | null;
}) {
  return (
    <>
      <div className="card mt">
        <div className="sec-title">
          <h2>Your reports</h2>
          <span className="sub">{reports.length} sent · live status</span>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={onCompose}>
            + New report
          </button>
        </div>
        <p className="tiny" style={{ color: 'var(--txt-3)' }}>
          The status pill on each report reflects who's reading it right now. The
          indicator refreshes automatically every 20 seconds.
        </p>
      </div>

      <div className="card mt">
        {loading && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>loading.........</div>}
        {!loading && reports.length === 0 && (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>
            No reports sent yet. Use "New report" to send your first.
          </div>
        )}
        {reports.map((r) => (
          <ReportCard
            key={r._id}
            r={r}
            color={classify(r, presence)}
            isSuper={false}
            onMarkRead={onMarkRead}
            onMarkActioned={onMarkActioned}
            busy={busy}
          />
        ))}
      </div>

      <Legend />
    </>
  );
}

function Legend() {
  return (
    <div className="card mt" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <span className="tiny" style={{ color: 'var(--txt-3)' }}>legend:</span>
      <StatusPill color="grey" custom="grey · super admin offline" />
      <StatusPill color="orange" custom="orange · online, unread" />
      <StatusPill color="blue" custom="blue · read" />
      <StatusPill color="green" custom="green · marked for action" />
    </div>
  );
}
