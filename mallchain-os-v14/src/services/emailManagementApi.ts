import { api } from './api';

export interface EmailStatus {
  currentEmail: string | null;
  hasPendingChange: boolean;
  pendingChange?: {
    newEmail: string;
    status: 'pending' | 'current-verified' | 'new-verified' | 'completed' | 'expired' | 'rejected';
    createdAt: string;
    expiresAt: string;
  } | null;
}

export interface ChangeEmailResponse {
  success: boolean;
  message: string;
  verificationId: string;
  expiresAt: string;
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
   * Sends verification codes to both current and new email
   * @param newEmail - The new email address to change to
   */
  async initiateEmailChange(newEmail: string) {
    return api.post<ChangeEmailResponse>('/api/email-management/change-email', {
      newEmail,
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
};
