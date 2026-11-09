import type { MinesSubmission } from '../../services/minesApi';

/**
 * One vocabulary for what a submission is doing, because `status` and
 * `assignment_status` are database field names and every Mines panel used to
 * print them raw — 'manual_review' tells a participant nothing about whether
 * they have been paid, and two panels saying 'voting' and 'in review' for the
 * same row reads like two different systems.
 *
 * `paid` is deliberately the same trio the backend treats as terminal
 * (routes/mines.js TERMINAL_STATUSES, adminPanel.js MINING_TERMINAL_STATUSES,
 * minesReviewService settle()): a submission is only an earning once it is
 * both approved and settled.
 */
export type SubmissionState = 'paid' | 'rejected' | 'reviewing' | 'queued';

export function submissionState(s: Pick<MinesSubmission, 'status' | 'assignment_status'>): SubmissionState {
  if (s.status === 'auto_approved' || s.status === 'approved') return 'paid';
  if (s.status === 'rejected') return 'rejected';
  if (s.assignment_status === 'assigned' || s.assignment_status === 'voting') return 'reviewing';
  return 'queued';
}

const LABELS: Record<SubmissionState, string> = {
  paid: 'Approved and paid',
  rejected: 'Rejected',
  reviewing: 'With reviewers',
  queued: 'Queued for review',
};

export const submissionLabel = (s: Pick<MinesSubmission, 'status' | 'assignment_status'>): string =>
  LABELS[submissionState(s)];

/** The chip class the design system already has, keyed off the same state. */
export const submissionChip = (s: Pick<MinesSubmission, 'status' | 'assignment_status'>): string => {
  const state = submissionState(s);
  if (state === 'paid') return 'b-approved';
  if (state === 'rejected') return 'b-rejected';
  return 'b-pending';
};

/**
 * StatusChip's own vocabulary, for the panels that use that component instead
 * of a raw badge. The two STATUS_MAPs these replace disagreed with each other
 * — MinesHistory mapped 'approved', MinesParticipation did not, so the same
 * settled row rendered a green chip in one panel and a grey bullet in another.
 */
export const submissionChipToken = (s: Pick<MinesSubmission, 'status' | 'assignment_status'>): 'approved' | 'rejected' | 'pending' => {
  const state = submissionState(s);
  return state === 'paid' ? 'approved' : state === 'rejected' ? 'rejected' : 'pending';
};
