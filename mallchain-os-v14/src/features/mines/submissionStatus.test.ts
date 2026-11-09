import { describe, expect, test } from 'vitest';
import { submissionChipToken, submissionLabel, submissionState } from './submissionStatus';

const sub = (status: string, assignment_status = 'manual_review') => ({ status, assignment_status });

describe('submissionState', () => {
  test('treats both approval spellings as paid', () => {
    // The backend writes 'auto_approved' from reviewer consensus and the admin
    // queue uses the same value, but 'approved' also exists in older rows and
    // in the leaderboard $match — a panel that only knew one of them showed a
    // paid submission as still awaiting review.
    expect(submissionState(sub('auto_approved'))).toBe('paid');
    expect(submissionState(sub('approved'))).toBe('paid');
  });

  test('separates reviewer-held from still queued', () => {
    expect(submissionState(sub('pending', 'assigned'))).toBe('reviewing');
    expect(submissionState(sub('pending', 'voting'))).toBe('reviewing');
    expect(submissionState(sub('pending', 'manual_review'))).toBe('queued');
    expect(submissionState(sub('pending'))).toBe('queued');
  });

  test('a terminal status wins over whatever assignment_status still says', () => {
    // settle() closes both fields, but a row written by the admin approve route
    // before that fix can carry assignment_status 'voting' while already paid.
    expect(submissionState(sub('auto_approved', 'voting'))).toBe('paid');
    expect(submissionState(sub('rejected', 'assigned'))).toBe('rejected');
  });

  test('missing assignment_status does not throw', () => {
    expect(submissionState({ status: 'pending' } as never)).toBe('queued');
  });
});

describe('submissionLabel / submissionChipToken', () => {
  test.each([
    ['auto_approved', 'Approved and paid', 'approved'],
    ['approved', 'Approved and paid', 'approved'],
    ['rejected', 'Rejected', 'rejected'],
    ['pending', 'Queued for review', 'pending'],
    ['manual_review', 'Queued for review', 'pending'],
  ] as const)('%s reads as the same words and colour everywhere', (status, label, chip) => {
    expect(submissionLabel(sub(status))).toBe(label);
    expect(submissionChipToken(sub(status))).toBe(chip);
  });

  test('never leaks a raw database value into the label', () => {
    for (const status of ['manual_review', 'pending_assignment', 'auto_approved', 'voting']) {
      expect(submissionLabel(sub(status))).not.toBe(status);
    }
  });
});
