/**
 * Pending-task email notifier for category admins.
 *
 * Every category admin (User.role === 'admin' with a matching adminCategory)
 * is emailed a digest of the open items that need THEIR attention, mirroring
 * the exact pending-queue filters the admin panel itself uses in
 * routes/adminPanel.js so the email count always matches what the admin would
 * see when they open the window. Superadmins (role 'superadmin', adminCategory
 * null) receive one combined digest covering every category.
 *
 * Categories that have an actionable queue:
 *   validator — validator applications awaiting review
 *   kyc       — KYC submissions + withdrawal AML reviews awaiting a decision
 *   treasury  — withdrawals awaiting payout, manual liquidity reconciliations,
 *               unacknowledged structuring flags
 *   mining    — task submissions in manual review, badge purchases awaiting admin
 *
 * users / blockchain / marketplace / mlpts / reports have no inbound approval
 * queue (they are read-only dashboards or the reverse "reports→superadmin"
 * inbox), so they are intentionally not notified — an admin with nothing to act
 * on gets nothing, by design.
 *
 * Cooldown: an email is only sent when a category actually has pending items
 * AND either (a) the pending snapshot changed since the last email to that
 * recipient (new work arrived / some was cleared) or (b) a stale-backlog
 * reminder interval has elapsed so a still-open queue is re-announced. This
 * keeps "always notify" responsive to NEW work without re-mailing an unchanged
 * queue on every hourly tick. The snapshot lives in Redis (global.redisClient)
 * and falls back to an in-process map when Redis is unavailable.
 */
const cron = require('node-cron');
const logger = require('../utils/logger');
const brevoService = require('../services/brevoService');
const { decryptField } = require('../utils/fieldEncryption');

const User = require('../models/user');
const ValidatorApplication = require('../models/ValidatorApplication');
const KYC = require('../models/kyc');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const WithdrawalStructuringFlag = require('../models/WithdrawalStructuringFlag');
const TaskSubmission = require('../models/TaskSubmission');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const BadgePurchase = require('../models/BadgePurchase');

// category → the named pending queues that count as "needs your attention".
// Each query is lifted verbatim from the matching adminPanel.js route so the
// digest and the panel can never drift apart. Structuring flags are shared
// between treasury and kyc (requireAnyCategory(['treasury','kyc'])); we
// attribute them to treasury to avoid emailing the same queue to two admins.
const CATEGORY_QUEUES = {
  validator: [
    { key: 'validatorApplications', label: 'Validator applications', Model: ValidatorApplication, query: { status: 'pending' }, panelPath: '/admin/validators' },
  ],
  kyc: [
    { key: 'kycPending', label: 'KYC submissions', Model: KYC, query: { status: { $in: ['pending', 'review'] } }, panelPath: '/admin/kyc' },
    { key: 'amlPending', label: 'Withdrawal AML reviews', Model: WithdrawalAmlReview, query: { status: 'pending' }, panelPath: '/admin/aml' },
  ],
  treasury: [
    { key: 'withdrawalsPending', label: 'Withdrawals awaiting payout', Model: WithdrawalRequest, query: { status: 'pending_review' }, panelPath: '/admin/withdrawals' },
    { key: 'reconciliationsManual', label: 'Reconciliations needing manual review', Model: LiquidityReconciliation, query: { status: 'pending_manual' }, panelPath: '/admin/reconciliation' },
    { key: 'structuringFlags', label: 'Unacknowledged structuring flags', Model: WithdrawalStructuringFlag, query: { acknowledged: false }, panelPath: '/admin/structuring' },
  ],
  mining: [
    { key: 'taskSubmissions', label: 'Mining submissions in review', Model: TaskSubmission, query: { status: 'manual_review' }, panelPath: '/admin/mining' },
    { key: 'badgePurchases', label: 'Badge purchases awaiting approval', Model: BadgePurchase, query: { status: 'awaiting_admin' }, panelPath: '/admin/badges' },
  ],
};

const CATEGORY_LABELS = {
  validator: 'Validator review',
  kyc: 'KYC & AML review',
  treasury: 'Treasury & liquidity',
  mining: 'Mining & badges',
};

function adminPanelUrl() {
  return (process.env.ADMIN_PANEL_URL || 'https://mallchain.network').replace(/\/+$/, '');
}

/**
 * Count every pending queue for one category. Returns
 * { totals: {key:count}, total: number }.
 */
async function countCategory(category) {
  const queues = CATEGORY_QUEUES[category] || [];
  const counts = await Promise.all(queues.map((q) => q.Model.countDocuments(q.query)));
  const totals = {};
  let total = 0;
  queues.forEach((q, i) => {
    totals[q.key] = counts[i];
    total += counts[i];
  });
  return { totals, total, queues };
}

/**
 * Build the full pending snapshot across every actionable category.
 * Returns { byCategory: { [category]: { totals, total } }, grandTotal }.
 */
async function computePendingSnapshot() {
  const categories = Object.keys(CATEGORY_QUEUES);
  const results = await Promise.all(categories.map(async (c) => [c, await countCategory(c)]));
  const byCategory = {};
  let grandTotal = 0;
  for (const [category, snapshot] of results) {
    byCategory[category] = snapshot;
    grandTotal += snapshot.total;
  }
  return { byCategory, grandTotal };
}

// ---- cooldown / dedup store -------------------------------------------------
// In-process fallback map so the notifier still de-duplicates when Redis is
// down (mirrors how other jobs degrade gracefully without Redis).
const memorySnapshots = new Map();

function redisAvailable() {
  return Boolean(global.redisClient && global.redisClient.status !== 'end' && global.redisClient.status !== 'close');
}

async function getCooldown(recipientKey) {
  if (redisAvailable()) {
    try {
      const raw = await global.redisClient.get(cooldownRedisKey(recipientKey));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn('pendingTaskNotifier', 'Redis cooldown read failed, using memory', { error: err.message });
    }
  }
  return memorySnapshots.get(recipientKey) || null;
}

async function setCooldown(recipientKey, entry) {
  memorySnapshots.set(recipientKey, entry);
  if (redisAvailable()) {
    try {
      const ttl = Math.max(3600, (parseInt(process.env.PENDING_TASK_NOTIFY_TTL_SECONDS, 10) || 30 * 24 * 3600));
      await global.redisClient.set(cooldownRedisKey(recipientKey), JSON.stringify(entry), 'EX', ttl);
    } catch (err) {
      logger.warn('pendingTaskNotifier', 'Redis cooldown write failed', { error: err.message });
    }
  }
}

function cooldownRedisKey(recipientKey) {
  return `pendingTaskNotifier:${recipientKey}`;
}

// A compact, order-independent signature of the counts an email covered, so a
// re-run with identical numbers is treated as "nothing new".
function snapshotSignature(snapshot) {
  const parts = [];
  for (const category of Object.keys(snapshot).sort()) {
    const totals = snapshot[category].totals;
    for (const key of Object.keys(totals).sort()) parts.push(`${category}.${key}:${totals[key]}`);
  }
  return parts.join('|');
}

function reminderIntervalMs() {
  const hours = parseFloat(process.env.PENDING_TASK_NOTIFY_REMINDER_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

/**
 * Decide whether this recipient should get an email now given their last-sent
 * cooldown entry. Returns { send: boolean, reason: string }.
 */
function shouldSend(currentSignature, total, last) {
  if (total <= 0) return { send: false, reason: 'no pending items' };
  if (!last) return { send: true, reason: 'first run' };
  if (last.signature !== currentSignature) return { send: true, reason: 'counts changed' };
  const ageMs = Date.now() - new Date(last.sentAt).getTime();
  if (ageMs >= reminderIntervalMs()) return { send: true, reason: 'stale-backlog reminder' };
  return { send: false, reason: 'unchanged within reminder window' };
}

// ---- email rendering --------------------------------------------------------
function renderEmailHtml(recipientName, categories, snapshot) {
  const baseUrl = adminPanelUrl();
  const rows = [];
  for (const category of categories) {
    const { totals, queues } = queueView(category, snapshot);
    rows.push(`<tr><td colspan="2" style="padding:16px 8px 4px;font-weight:bold;color:#0f172a;border-bottom:1px solid #e2e8f0;">${CATEGORY_LABELS[category] || category}</td></tr>`);
    queues.forEach((q) => {
      const count = totals[q.key] || 0;
      if (count === 0) return;
      rows.push(
        `<tr>` +
        `<td style="padding:8px;color:#334155;">${q.label}</td>` +
        `<td style="padding:8px;text-align:right;">` +
        `<a href="${baseUrl}${q.panelPath}" style="background:#06b6d4;color:#fff;padding:6px 12px;border-radius:5px;text-decoration:none;font-weight:bold;">${count} pending</a>` +
        `</td></tr>`
      );
    });
  }
  const grand = categories.reduce((sum, c) => sum + (snapshot[c]?.total || 0), 0);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#06b6d4;">Mallchain — pending tasks for ${recipientName}</h2>
      <p style="color:#475569;">You have <strong>${grand}</strong> item${grand === 1 ? '' : 's'} waiting on your review. Open a queue to action it:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join('')}</table>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px;">This digest repeats when new items arrive or once every ${reminderIntervalMs() / 3600000}h while anything stays open. Counts match the admin panel exactly.</p>
      ${brevoService.complianceFooter()}
    </div>
  `;
}

// Attach the live queue definitions (labels + paths) to a stored snapshot for
// rendering, since snapshots only persist counts, not the queue metadata.
function queueView(category, snapshot) {
  const entry = snapshot[category] || { totals: {} };
  return { totals: entry.totals || {}, queues: CATEGORY_QUEUES[category] || [] };
}

function subjectFor(categories, snapshot) {
  const grand = categories.reduce((sum, c) => sum + (snapshot[c]?.total || 0), 0);
  if (categories.length === 1) {
    return `[Mallchain] ${grand} pending task${grand === 1 ? '' : 's'} — ${CATEGORY_LABELS[categories[0]] || categories[0]}`;
  }
  return `[Mallchain] ${grand} pending tasks across ${categories.length} areas — super admin digest`;
}

// ---- recipient resolution ---------------------------------------------------
// Email is encrypted at rest; a lean query returns ciphertext, so decrypt per
// record. Skip erased/banned accounts and anyone without a recoverable email.
async function loadAdmins() {
  const admins = await User.find({ role: 'admin', banned: false, erasedAt: null }).lean();
  const superadmins = await User.find({ role: 'superadmin', banned: false, erasedAt: null }).lean();
  const emailOf = (u) => {
    try { return decryptField(u.email) || null; } catch { return null; }
  };
  return {
    byCategory: admins.reduce((acc, u) => {
      const email = emailOf(u);
      if (!email || !u.adminCategory) return acc;
      (acc[u.adminCategory] ||= []).push({ email, name: u.name || u.username || email });
      return acc;
    }, {}),
    superadmins: superadmins.map((u) => ({ email: emailOf(u), name: u.name || u.username || u.email })).filter((r) => r.email),
  };
}

/**
 * One notifier pass: compute the snapshot, resolve recipients, and email each
 * category admin (and every superadmin) their open-item digest — subject to
 * the changed-counts / reminder cooldown above.
 */
async function runPendingTaskNotify({ force = false } = {}) {
  const snapshot = await computePendingSnapshot();
  const signature = snapshotSignature(snapshot.byCategory);
  const { byCategory, superadmins } = await loadAdmins();

  let sent = 0, skipped = 0, failed = 0;

  // Category admins: exactly the categories they own.
  for (const [category, recipients] of Object.entries(byCategory)) {
    if (!snapshot.byCategory[category]) continue; // non-actionable category
    for (const recipient of recipients) {
      const key = `cat:${category}:${recipient.email}`;
      const last = await getCooldown(key);
      const decision = force ? { send: true, reason: 'forced' } : shouldSend(signatureForCategory(snapshot, category), snapshot.byCategory[category].total, last);
      const res = await deliver(recipient, [category], snapshot, decision, key, signatureForCategory(snapshot, category));
      if (res === 'sent') sent++; else if (res === 'skipped') skipped++; else failed++;
    }
  }

  // Superadmins: one combined digest of every actionable category.
  for (const recipient of superadmins) {
    const cats = Object.keys(CATEGORY_QUEUES);
    const key = `super:${recipient.email}`;
    const last = await getCooldown(key);
    const decision = force ? { send: true, reason: 'forced' } : shouldSend(signature, snapshot.grandTotal, last);
    const res = await deliver(recipient, cats, snapshot, decision, key, signature);
    if (res === 'sent') sent++; else if (res === 'skipped') skipped++; else failed++;
  }

  logger.info('pendingTaskNotifier', 'run complete', {
    grandTotal: snapshot.grandTotal, sent, skipped, failed,
  });
  return { snapshot, sent, skipped, failed };
}

// Per-category signature so one category's new work doesn't re-mail every
// other category's admins on the same tick.
function signatureForCategory(snapshot, category) {
  return snapshotSignature({ [category]: snapshot.byCategory[category] });
}

/**
 * Send one recipient their digest if the cooldown decision allows. Returns
 * 'sent' | 'skipped' | 'failed'.
 */
async function deliver(recipient, categories, snapshot, decision, cooldownKey, currentSignature) {
  const grand = categories.reduce((sum, c) => sum + (snapshot.byCategory[c]?.total || 0), 0);
  if (!decision.send) {
    logger.debug && logger.debug('pendingTaskNotifier', 'cooldown skip', { to: recipient.email, reason: decision.reason });
    return 'skipped';
  }
  try {
    const html = renderEmailHtml(recipient.name, categories, snapshot.byCategory);
    const result = await brevoService.sendEmail(recipient.email, subjectFor(categories, snapshot.byCategory), html);
    if (result.success) {
      await setCooldown(cooldownKey, { signature: currentSignature, sentAt: new Date().toISOString(), grandTotal: grand });
      logger.info('pendingTaskNotifier', 'notified', { to: recipient.email, categories: categories.join(','), reason: decision.reason, count: grand });
      return 'sent';
    }
    logger.warn('pendingTaskNotifier', 'email send failed', { to: recipient.email, error: result.error });
    return 'failed';
  } catch (err) {
    logger.error('pendingTaskNotifier', 'deliver threw', err, { to: recipient.email });
    return 'failed';
  }
}

function start() {
  if (process.env.DISABLE_CRON === '1') {
    logger.info('pendingTaskNotifier', 'DISABLE_CRON=1 — pending-task notifier not scheduled');
    return;
  }
  if (process.env.PENDING_TASK_NOTIFY_ENABLED === '0') {
    logger.info('pendingTaskNotifier', 'PENDING_TASK_NOTIFY_ENABLED=0 — notifier disabled');
    return;
  }
  const schedule = process.env.PENDING_TASK_NOTIFY_CRON || '0 * * * *'; // hourly
  cron.schedule(schedule, () => {
    runPendingTaskNotify().catch((err) => logger.error('pendingTaskNotifier', 'notify run threw', err));
  });
  logger.info('pendingTaskNotifier', 'started', { schedule });
}

module.exports = { runPendingTaskNotify, computePendingSnapshot, start, CATEGORY_QUEUES };
// Pure helpers exposed for unit testing (no DB / no email side effects).
module.exports._internals = { shouldSend, snapshotSignature, reminderIntervalMs };
