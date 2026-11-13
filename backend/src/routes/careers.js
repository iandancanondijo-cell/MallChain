const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { requireVerifiedKyc } = require('../middleware/requireKyc');
const { sanitizeInputs, limitPayloadSize, preventNoSQLInjection } = require('../middleware/inputValidation');
const { createLimiter } = require('../middleware/rateLimiter');
const JobOpening = require('../models/JobOpening');
const JobApplication = require('../models/JobApplication');
const User = require('../models/user');
const { notify } = require('../services/notificationEngine');
const { respondFailure } = require('../utils/respondFailure');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

const postLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const applyLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

const WORKSPACES = ['Engineering', 'Design', 'Product', 'Research', 'Growth', 'Marketing', 'Community', 'Operations', 'Support', 'Finance', 'Legal', 'Security', 'Data', 'Other'];
const FIELDS = ['Software', 'Blockchain', 'Frontend', 'Backend', 'DevOps', 'Mobile', 'Design', 'Product', 'Research', 'Data Science', 'Marketing', 'Community', 'Content', 'Support', 'Operations', 'Finance', 'Legal', 'Security', 'Sales', 'Other'];
const EDUCATION = ['none', 'certificate', 'diploma', 'bachelors', 'masters', 'doctorate'];
const SENIORITY = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];
const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'freelance', 'internship'];
const WORK_MODES = ['remote', 'hybrid', 'onsite'];
const PAY_PERIODS = ['hour', 'month', 'year'];

const LIMITS = {
  title: 120, workspace: 60, field: 60, description: 4000, location: 120,
  equity: 120, applicationInstructions: 1000, message: 2000, authorNote: 1000,
  listItem: 300, listItems: 20,
};

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * A list field arrives as an array of strings (the client sends one per line).
 * Anything else is refused rather than coerced, so a malformed payload cannot
 * silently publish a requirements list of "[object Object]".
 */
function list(value, field) {
  if (value === undefined || value === null) return { lines: [] };
  if (!Array.isArray(value)) return { error: `${field} must be a list of lines` };
  if (value.length > LIMITS.listItems) return { error: `${field} can hold at most ${LIMITS.listItems} lines` };
  if (value.some((v) => typeof v !== 'string')) return { error: `${field} must be a list of lines` };
  return { lines: value.map((v) => v.trim()).filter(Boolean).map((v) => v.slice(0, LIMITS.listItem)) };
}

function choice(value, allowed, field) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (!allowed.includes(value)) return { error: `${field} must be one of: ${allowed.join(', ')}` };
  return { value };
}

/**
 * The whole spec, validated once and reused by create and edit. Returns either
 * { error } or { doc }. `partial` lets an edit leave untouched fields alone.
 */
function readSpec(body, { partial = false } = {}) {
  const out = {};
  const put = (key, value) => { if (!partial || value !== undefined) out[key] = value; };

  const title = text(body.title, LIMITS.title);
  if (!partial || body.title !== undefined) {
    if (title.length < 4) return { error: 'title is required (at least 4 characters)' };
    put('title', title);
  }

  for (const [key, allowed] of [['workspace', WORKSPACES], ['field', FIELDS]]) {
    const v = text(body[key], LIMITS[key]);
    if (!partial || body[key] !== undefined) {
      if (!allowed.includes(v)) return { error: `${key} must be one of: ${allowed.join(', ')}` };
      put(key, v);
    }
  }

  const description = text(body.description, LIMITS.description);
  if (!partial || body.description !== undefined) {
    if (description.length < 20) return { error: 'description is required (at least 20 characters) — say what the role actually involves' };
    put('description', description);
  }

  for (const key of ['responsibilities', 'requirements', 'skills', 'preferredSkills', 'benefits']) {
    if (partial && body[key] === undefined) continue;
    const { lines, error } = list(body[key], key);
    if (error) return { error };
    if (key === 'skills' && lines.length === 0) return { error: 'skills is required — name at least one skill the role needs' };
    put(key, lines);
  }

  for (const [key, allowed] of [
    ['educationLevel', EDUCATION], ['seniority', SENIORITY],
    ['employmentType', EMPLOYMENT], ['workMode', WORK_MODES], ['payPeriod', PAY_PERIODS],
  ]) {
    const { value, error } = choice(body[key], allowed, key);
    if (error) return { error };
    if (value !== null) put(key, value);
  }

  if (body.experienceYears !== undefined) {
    const n = Number(body.experienceYears);
    if (!Number.isInteger(n) || n < 0 || n > 60) return { error: 'experienceYears must be a whole number between 0 and 60' };
    put('experienceYears', n);
  }
  if (body.positions !== undefined) {
    const n = Number(body.positions);
    if (!Number.isInteger(n) || n < 1 || n > 999) return { error: 'positions must be a whole number between 1 and 999' };
    put('positions', n);
  }

  for (const key of ['payMin', 'payMax']) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      if (!partial) put(key, null);
      continue;
    }
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: `${key} must be a non-negative number` };
    put(key, n);
  }
  const min = out.payMin ?? (partial ? undefined : null);
  const max = out.payMax ?? (partial ? undefined : null);
  if (min != null && max != null && min > max) return { error: 'the minimum pay cannot be higher than the maximum' };

  if (body.payCurrency !== undefined) {
    const c = text(body.payCurrency, 8).toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return { error: 'payCurrency must be a three-letter code such as USD or KES' };
    put('payCurrency', c);
  }

  put('location', text(body.location, LIMITS.location));
  put('equity', text(body.equity, LIMITS.equity));
  put('applicationInstructions', text(body.applicationInstructions, LIMITS.applicationInstructions));

  if (body.deadline !== undefined && body.deadline !== null && body.deadline !== '') {
    const d = new Date(body.deadline);
    if (Number.isNaN(d.getTime())) return { error: 'deadline must be a date' };
    if (!partial && d.getTime() < Date.now()) return { error: 'deadline cannot be in the past' };
    put('deadline', d);
  } else if (!partial) {
    put('deadline', null);
  }

  return { doc: out };
}

/**
 * Public-facing author name. An ObjectId is not something to print for a
 * person, and an email address is not something to hand to strangers on a job
 * board, so only the handle (or the display name) is resolved.
 */
async function namesFor(ids) {
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('_id username name').lean();
  return new Map(users.map((u) => [String(u._id), u.username || u.name || 'A Mallchain member']));
}

function openingView(doc, name, extra = {}) {
  return {
    id: String(doc._id),
    authorId: String(doc.authorId),
    authorName: name,
    title: doc.title,
    workspace: doc.workspace,
    field: doc.field,
    description: doc.description,
    responsibilities: doc.responsibilities || [],
    requirements: doc.requirements || [],
    skills: doc.skills || [],
    preferredSkills: doc.preferredSkills || [],
    benefits: doc.benefits || [],
    educationLevel: doc.educationLevel,
    experienceYears: doc.experienceYears,
    seniority: doc.seniority,
    employmentType: doc.employmentType,
    location: doc.location || '',
    workMode: doc.workMode,
    positions: doc.positions,
    payMin: doc.payMin ?? null,
    payMax: doc.payMax ?? null,
    payCurrency: doc.payCurrency || 'USD',
    payPeriod: doc.payPeriod || 'month',
    equity: doc.equity || '',
    applicationInstructions: doc.applicationInstructions || '',
    deadline: doc.deadline ? doc.deadline.toISOString() : null,
    status: doc.status,
    applicationsCount: doc.applicationsCount || 0,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
    ...extra,
  };
}

// GET /api/careers/options - the vocabularies the posting form and the board's
// filters share, so a client never has to hardcode a list the server rejects.
router.get('/options', auth, (_req, res) => {
  res.json(ok({
    workspaces: WORKSPACES, fields: FIELDS, educationLevels: EDUCATION,
    seniorities: SENIORITY, employmentTypes: EMPLOYMENT, workModes: WORK_MODES, payPeriods: PAY_PERIODS,
  }));
});

// GET /api/careers/openings - the board. Newest first, open by default; a
// closed or filled opening is only returned when the caller asks for it.
router.get('/openings', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = ['open', 'closed', 'filled', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const query = {};
    if (status !== 'all') query.status = status;
    if (req.query.workspace) query.workspace = text(req.query.workspace, LIMITS.workspace);
    if (req.query.field) query.field = text(req.query.field, LIMITS.field);
    if (WORK_MODES.includes(req.query.workMode)) query.workMode = req.query.workMode;
    if (EMPLOYMENT.includes(req.query.employmentType)) query.employmentType = req.query.employmentType;
    if (SENIORITY.includes(req.query.seniority)) query.seniority = req.query.seniority;
    if (EDUCATION.includes(req.query.educationLevel)) query.educationLevel = req.query.educationLevel;
    const q = text(req.query.q, 80);
    if (q) {
      // A literal search: regex metacharacters typed by a user are characters
      // to look for, not a pattern to run.
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { skills: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [rows, total, workspaces, fields] = await Promise.all([
      JobOpening.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      JobOpening.countDocuments(query),
      JobOpening.distinct('workspace', { status: 'open' }),
      JobOpening.distinct('field', { status: 'open' }),
    ]);
    const names = await namesFor(rows.map((r) => r.authorId));
    res.json(ok({
      // `mine` travels on the board too: without it your own posting offers an
      // Apply button the very next request would refuse.
      openings: rows.map((r) => openingView(r, names.get(String(r.authorId)) || 'A Mallchain member', {
        mine: String(r.authorId) === String(req.user._id),
      })),
      total, limit, offset,
      // What is actually on the board right now, so the filter chips never
      // offer a workspace that has no openings in it.
      availableWorkspaces: workspaces.sort(),
      availableFields: fields.sort(),
    }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/careers/openings/mine - what this account has published, including
// closed ones, with the live application count for each.
router.get('/openings/mine', auth, async (req, res) => {
  try {
    const rows = await JobOpening.find({ authorId: req.user._id }).sort({ createdAt: -1 }).lean();
    const names = await namesFor([req.user._id]);
    res.json(ok(rows.map((r) => openingView(r, names.get(String(req.user._id)) || 'You', { mine: true }))));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/careers/openings - publish a real opening. Verification is required
// because the posting carries an identity a stranger will act on.
router.post('/openings', auth, postLimiter, limitPayloadSize(1), sanitizeInputs, preventNoSQLInjection, requireVerifiedKyc(), async (req, res) => {
  try {
    const { doc, error } = readSpec(req.body || {});
    if (error) return res.status(400).json(fail(error));

    const created = await JobOpening.create({ ...doc, authorId: req.user._id });
    const names = await namesFor([req.user._id]);
    res.status(201).json(ok(openingView(created, names.get(String(req.user._id)) || 'You', { mine: true })));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/careers/openings/:id - the full spec, plus whether the caller has
// already applied so the board can say so instead of offering a second Apply.
router.get('/openings/:id', auth, async (req, res) => {
  try {
    const opening = await JobOpening.findById(req.params.id).lean();
    if (!opening) return res.status(404).json(fail('Opening not found'));
    const names = await namesFor([opening.authorId]);
    const mine = await JobApplication.findOne({ openingId: opening._id, applicantId: req.user._id }).lean();
    res.json(ok(openingView(opening, names.get(String(opening.authorId)) || 'A Mallchain member', {
      mine: String(opening.authorId) === String(req.user._id),
      myApplication: mine ? { id: String(mine._id), status: mine.status, message: mine.message, createdAt: mine.createdAt.toISOString() } : null,
    })));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// PATCH /api/careers/openings/:id - the author edits or closes their posting.
router.patch('/openings/:id', auth, limitPayloadSize(1), sanitizeInputs, preventNoSQLInjection, async (req, res) => {
  try {
    const opening = await JobOpening.findById(req.params.id);
    if (!opening) return res.status(404).json(fail('Opening not found'));
    if (String(opening.authorId) !== String(req.user._id)) {
      return res.status(403).json(fail('Only the account that posted this opening can change it'));
    }

    const body = req.body || {};
    if (body.status !== undefined) {
      if (!['open', 'closed', 'filled'].includes(body.status)) return res.status(400).json(fail('status must be open, closed or filled'));
      opening.status = body.status;
    }
    const specKeys = ['title', 'workspace', 'field', 'description', 'responsibilities', 'requirements', 'skills',
      'preferredSkills', 'benefits', 'educationLevel', 'experienceYears', 'seniority', 'employmentType',
      'location', 'workMode', 'positions', 'payMin', 'payMax', 'payCurrency', 'payPeriod', 'equity',
      'applicationInstructions', 'deadline'];
    if (specKeys.some((k) => body[k] !== undefined)) {
      const { doc, error } = readSpec(body, { partial: true });
      if (error) return res.status(400).json(fail(error));
      Object.assign(opening, doc);
    }

    await opening.save();
    const names = await namesFor([req.user._id]);
    res.json(ok(openingView(opening, names.get(String(req.user._id)) || 'You', { mine: true })));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// DELETE /api/careers/openings/:id - only while nobody has applied. Once there
// are applications the author closes the opening instead, so the people who
// applied are not left holding a reference to something that vanished.
router.delete('/openings/:id', auth, async (req, res) => {
  try {
    const opening = await JobOpening.findById(req.params.id);
    if (!opening) return res.status(404).json(fail('Opening not found'));
    if (String(opening.authorId) !== String(req.user._id)) {
      return res.status(403).json(fail('Only the account that posted this opening can delete it'));
    }
    const applications = await JobApplication.countDocuments({ openingId: opening._id });
    if (applications > 0) {
      return res.status(409).json(fail(`${applications} application(s) already point at this opening — close it instead of deleting it`));
    }
    await JobOpening.deleteOne({ _id: opening._id });
    res.json(ok({ deleted: true }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/careers/openings/:id/apply - the applicant's message goes to the
// person who published the opening, as a notification on their account.
router.post('/openings/:id/apply', auth, applyLimiter, limitPayloadSize(1), sanitizeInputs, preventNoSQLInjection, requireVerifiedKyc(), async (req, res) => {
  try {
    const opening = await JobOpening.findById(req.params.id);
    if (!opening) return res.status(404).json(fail('Opening not found'));
    if (String(opening.authorId) === String(req.user._id)) {
      return res.status(400).json(fail('You cannot apply to an opening you posted'));
    }
    if (opening.status !== 'open') {
      return res.status(409).json(fail(`This opening is ${opening.status}, so it is no longer accepting applications`));
    }
    if (opening.deadline && opening.deadline.getTime() < Date.now()) {
      return res.status(409).json(fail('The application deadline for this opening has passed'));
    }
    const message = text(req.body?.message, LIMITS.message);
    if (message.length < 20) {
      return res.status(400).json(fail('message is required (at least 20 characters) — tell the author who you are and why you fit'));
    }

    const existing = await JobApplication.findOne({ openingId: opening._id, applicantId: req.user._id }).lean();
    if (existing) {
      return res.status(409).json(fail('You have already applied to this opening'));
    }

    let application;
    try {
      application = await JobApplication.create({
        openingId: opening._id,
        applicantId: req.user._id,
        authorId: opening.authorId,
        message,
      });
    } catch (e) {
      // The unique index is the real duplicate guard; two concurrent clicks
      // both pass the read above and the second one lands here.
      if (e && e.code === 11000) return res.status(409).json(fail('You have already applied to this opening'));
      throw e;
    }
    await JobOpening.updateOne({ _id: opening._id }, { $inc: { applicationsCount: 1 } });

    const names = await namesFor([req.user._id, opening.authorId]);
    await notify(opening.authorId, {
      kind: 'system',
      title: `New application: ${opening.title}`,
      body: `${names.get(String(req.user._id)) || 'A Mallchain member'} applied to your opening “${opening.title}”. Their message: ${message.slice(0, 300)}`,
      data: { openingId: String(opening._id), applicationId: String(application._id) },
    });

    res.status(201).json(ok({
      id: String(application._id),
      openingId: String(opening._id),
      status: application.status,
      message,
      createdAt: application.createdAt.toISOString(),
      openingTitle: opening.title,
      authorName: names.get(String(opening.authorId)) || 'A Mallchain member',
    }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/careers/openings/:id/applications - the author's inbox for one
// opening. Applicant names only: no email, no wallet, no KYC detail.
router.get('/openings/:id/applications', auth, async (req, res) => {
  try {
    const opening = await JobOpening.findById(req.params.id).lean();
    if (!opening) return res.status(404).json(fail('Opening not found'));
    if (String(opening.authorId) !== String(req.user._id)) {
      return res.status(403).json(fail('Only the account that posted this opening can read its applications'));
    }
    const rows = await JobApplication.find({ openingId: opening._id }).sort({ createdAt: -1 }).lean();
    const names = await namesFor(rows.map((r) => r.applicantId));
    res.json(ok(rows.map((r) => ({
      id: String(r._id),
      applicantId: String(r.applicantId),
      applicantName: names.get(String(r.applicantId)) || 'A Mallchain member',
      message: r.message,
      status: r.status,
      authorNote: r.authorNote || '',
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    }))));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/careers/applications/mine - everything this account has applied to.
router.get('/applications/mine', auth, async (req, res) => {
  try {
    const rows = await JobApplication.find({ applicantId: req.user._id }).sort({ createdAt: -1 }).lean();
    const openings = rows.length
      ? await JobOpening.find({ _id: { $in: rows.map((r) => r.openingId) } }).select('_id title workspace field status').lean()
      : [];
    const byId = new Map(openings.map((o) => [String(o._id), o]));
    const names = await namesFor(rows.map((r) => r.authorId));
    res.json(ok(rows.map((r) => {
      const o = byId.get(String(r.openingId));
      return {
        id: String(r._id),
        openingId: String(r.openingId),
        openingTitle: o ? o.title : 'This opening was removed',
        workspace: o ? o.workspace : '',
        field: o ? o.field : '',
        openingStatus: o ? o.status : 'closed',
        authorName: names.get(String(r.authorId)) || 'A Mallchain member',
        message: r.message,
        status: r.status,
        authorNote: r.authorNote || '',
        createdAt: r.createdAt.toISOString(),
        respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
      };
    })));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// PATCH /api/careers/applications/:id - the author answers an application.
router.patch('/applications/:id', auth, limitPayloadSize(1), sanitizeInputs, preventNoSQLInjection, async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.id);
    if (!application) return res.status(404).json(fail('Application not found'));
    if (String(application.authorId) !== String(req.user._id)) {
      return res.status(403).json(fail('Only the account that posted the opening can answer its applications'));
    }
    if (application.status === 'withdrawn') {
      return res.status(409).json(fail('The applicant withdrew this application'));
    }
    const { status, note } = req.body || {};
    if (!['shortlisted', 'rejected', 'hired', 'submitted'].includes(status)) {
      return res.status(400).json(fail('status must be submitted, shortlisted, rejected or hired'));
    }
    application.status = status;
    application.authorNote = text(note, LIMITS.authorNote);
    application.respondedAt = status === 'submitted' ? null : new Date();
    await application.save();

    const opening = await JobOpening.findById(application.openingId).select('title').lean();
    const title = opening ? opening.title : 'your opening';
    const words = { shortlisted: 'shortlisted', rejected: 'not taken forward', hired: 'accepted', submitted: 'put back under review' }[status];
    await notify(application.applicantId, {
      kind: 'system',
      title: `Application ${words}: ${title}`,
      body: application.authorNote
        ? `The author of “${title}” responded: ${application.authorNote}`
        : `The author of “${title}” marked your application ${words}.`,
      data: { openingId: String(application.openingId), applicationId: String(application._id) },
    });

    res.json(ok({ id: String(application._id), status: application.status, authorNote: application.authorNote }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/careers/applications/:id/withdraw - the applicant takes it back.
router.post('/applications/:id/withdraw', auth, async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.id);
    if (!application) return res.status(404).json(fail('Application not found'));
    if (String(application.applicantId) !== String(req.user._id)) {
      return res.status(403).json(fail('Only the applicant can withdraw an application'));
    }
    if (application.status === 'withdrawn') return res.json(ok({ id: String(application._id), status: 'withdrawn' }));
    application.status = 'withdrawn';
    application.respondedAt = new Date();
    await application.save();
    await JobOpening.updateOne(
      { _id: application.openingId, applicationsCount: { $gt: 0 } },
      { $inc: { applicationsCount: -1 } }
    );

    const opening = await JobOpening.findById(application.openingId).select('title').lean();
    const names = await namesFor([req.user._id]);
    await notify(application.authorId, {
      kind: 'system',
      title: `Application withdrawn: ${opening ? opening.title : 'your opening'}`,
      body: `${names.get(String(req.user._id)) || 'A Mallchain member'} withdrew their application.`,
      data: { openingId: String(application.openingId), applicationId: String(application._id) },
    });
    res.json(ok({ id: String(application._id), status: 'withdrawn' }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

module.exports = router;
