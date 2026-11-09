import { api } from './api';

export interface EmailStatus {
  currentEmail: string | null;
  /** True only when a code delivered to this address was answered. */
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  /** The confirmed recovery address, if one exists. */
  backupEmail: string | null;
  backupEmailVerifiedAt: string | null;
  hasPendingChange: boolean;
  pendingChange?: {
    newEmail: string;
    status: 'pending' | 'current-verified' | 'new-verified' | 'completed' | 'expired' | 'rejected';
    currentVerified: boolean;
    newVerified: boolean;
    createdAt: string;
    expiresAt: string;
  } | null;
  /** A backup-address challenge awaiting its code — separate from a change. */
  pendingBackupEmail: string | null;
  pendingBackupExpiresAt: string | null;
}

export interface ChangeEmailResponse {
  success: boolean;
  message: string;
  verificationId: string;
  expiresAt: string;
  /** The change requires step 1 (current address) before step 2 will accept a code. */
  requiresCurrentFirst?: boolean;
  sentTo?: string | { current: string; new: string };
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
  nextStep?: string;
  attemptsRemaining?: number;
}

export interface CompleteChangeResponse {
  success: boolean;
  message: string;
  newEmail: string;
}

export interface RecoveryOption {
  method: string;
  available: boolean;
  description: string;
}

export interface RecoveryOptions {
  primaryEmail: string | null;
  backupEmail: string | null;
  recoveryMethods: RecoveryOption[];
}

/**
 * Email Management API service
 * Handles email changes, verification, and backup email setup
 */
export const emailManagementApi = {
  /**
   * Get current email and verification status
   */
  async getEmailStatus() {
    return api.get<EmailStatus>('/api/email-management/status');
  },

  /**
   * Initiate email change request
   * Sends a different code to the current address and to the new one
   * @param newEmail - The new email address to change to
   */
  async initiateEmailChange(newEmail: string) {
    return api.post<ChangeEmailResponse>('/api/email-management/change-email', {
      newEmail,
    });
  },

  /**
   * Ask the server to deliver the signup code this account must answer.
   * Answers 503 email_delivery_unavailable when the mail provider refuses —
   * the wizard must not pretend a code is in the inbox in that case.
   */
  async sendSignupCode() {
    return api.post<{ success: boolean; alreadyVerified?: boolean; sentTo?: string; expiresAt?: string; message: string }>(
      '/api/email-management/send-signup-code',
      {}
    );
  },

  /**
   * Confirm the backup/recovery address by answering the code sent to IT.
   * Setting a backup email (setBackupEmail) only starts the challenge.
   */
  async verifyBackupEmail(verificationCode: string) {
    return api.post<VerifyEmailResponse>('/api/email-management/verify-backup-email', {
      verificationCode,
    });
  },

  /**
   * Verify the current email during change process
   * @param verificationCode - Code sent to current email
   */
  async verifyCurrentEmail(verificationCode: string) {
    return api.post<VerifyEmailResponse>('/api/email-management/verify-current-email', {
      verificationCode,
    });
  },

  /**
   * Verify the new email during change process
   * @param verificationCode - Code sent to new email
   */
  async verifyNewEmail(verificationCode: string) {
    return api.post<VerifyEmailResponse>('/api/email-management/verify-new-email', {
      verificationCode,
    });
  },

  /**
   * Complete the email change after both emails verified
   */
  async completeChange() {
    return api.post<CompleteChangeResponse>('/api/email-management/complete-change');
  },

  /**
   * Cancel a pending email change
   */
  async cancelChange() {
    return api.post<{ success: boolean; message: string }>('/api/email-management/cancel-change');
  },

  /**
   * Set up a backup email for account recovery
   * @param backupEmail - Email address to use as backup
   */
  async setBackupEmail(backupEmail: string) {
    return api.post<ChangeEmailResponse>('/api/email-management/set-backup-email', {
      backupEmail,
    });
  },

  /**
   * Get available account recovery options
   */
  async getRecoveryOptions() {
    return api.get<RecoveryOptions>('/api/email-management/recovery-options');
  },

  /**
   * Answer the code delivered to this account's own address.
   */
  async verifySignupCode(code: string) {
    return api.post<{ success: boolean; message: string }>('/api/email-management/verify-signup', { code });
  },
};

export interface EmailErrorDetails {
  code?: string;
  attemptsRemaining?: number;
}

/**
 * A refusal arrives as a flat sentence in `error` (what api.ts toasts) plus
 * machine-readable context in `details`. Reading only `error` is why this
 * panel used to guess at attempt counts instead of reporting them.
 */
export function emailErrorDetails(res: { details?: unknown }): EmailErrorDetails {
  return (res.details as EmailErrorDetails) || {};
}
