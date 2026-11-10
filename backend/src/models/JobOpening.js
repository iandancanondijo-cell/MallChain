const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * A job opening posted by a verified Mallchain account. Nothing here is seeded:
 * a row exists only because somebody published one, and it disappears from the
 * board when its author closes it.
 *
 * The long-form fields are lists of short strings rather than one blob so a
 * reader can scan requirements, skills and responsibilities separately, and so
 * each line is length-capped at the route instead of hiding inside an unbounded
 * description.
 */
const JobOpeningSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },

  // workspace = the team/space the role sits in; field = the discipline. Both
  // are filterable on the board, and both are required because a posting that
  // names neither cannot be found by anyone browsing for it.
  workspace: { type: String, required: true, index: true },
  field: { type: String, required: true, index: true },

  description: { type: String, required: true },
  responsibilities: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  skills: { type: [String], default: [] },
  preferredSkills: { type: [String], default: [] },
  benefits: { type: [String], default: [] },

  educationLevel: {
    type: String,
    enum: ['none', 'certificate', 'diploma', 'bachelors', 'masters', 'doctorate'],
    default: 'none',
  },
  experienceYears: { type: Number, default: 0, min: 0, max: 60 },
  seniority: {
    type: String,
    enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'],
    default: 'mid',
  },
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time', 'contract', 'freelance', 'internship'],
    default: 'full_time',
  },
  location: { type: String, default: '' },
  workMode: { type: String, enum: ['remote', 'hybrid', 'onsite'], default: 'remote' },
  positions: { type: Number, default: 1, min: 1, max: 999 },

  // Compensation is optional: an unpaid/volunteer or unspecified role must not
  // be forced to invent a number. When it is given, min <= max is enforced at
  // the route, and the period says what the numbers are per.
  payMin: { type: Number, default: null },
  payMax: { type: Number, default: null },
  payCurrency: { type: String, default: 'USD' },
  payPeriod: { type: String, enum: ['hour', 'month', 'year'], default: 'month' },
  equity: { type: String, default: '' },

  applicationInstructions: { type: String, default: '' },
  deadline: { type: Date, default: null },

  status: { type: String, enum: ['open', 'closed', 'filled'], default: 'open', index: true },
  applicationsCount: { type: Number, default: 0 },
}, { timestamps: true });

JobOpeningSchema.index({ status: 1, createdAt: -1 });
JobOpeningSchema.index({ workspace: 1, field: 1, status: 1 });
JobOpeningSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.models.JobOpening || mongoose.model('JobOpening', JobOpeningSchema);
