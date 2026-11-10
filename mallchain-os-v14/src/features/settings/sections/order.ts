/**
 * The page's one order.
 *
 * The cards used to sit in two columns in whatever order they were written,
 * which split related decisions across the page: notifications in one column,
 * the phone number that delivers them in the other; the badge status above and
 * the wallet it depends on below. This list is what the nav renders and what
 * the body is checked against (see Settings.test.tsx), so the two cannot
 * disagree.
 */
export interface StepDef {
  index: number;
  /** DOM id of the card wrapper, and the scroll target. */
  id: string;
  label: string;
  /** Rail heading the step sits under. */
  group: 'Your account' | 'How we reach you' | 'Safety' | 'Your choices' | 'Integrations' | 'This device';
  /**
   * Which read must succeed for this step to have anything truthful to show.
   * 'none' means the step answers from the session or from this device only.
   */
  needs: 'profile' | 'settings' | 'kyc' | 'contact' | 'none';
}

export const STEPS: StepDef[] = [
  { index: 1, id: 'ps-profile', label: 'Profile', group: 'Your account', needs: 'profile' },
  { index: 2, id: 'ps-status', label: 'Verification status', group: 'Your account', needs: 'settings' },
  { index: 3, id: 'ps-identity', label: 'Identity details', group: 'Your account', needs: 'kyc' },

  { index: 4, id: 'ps-contact', label: 'Contact number', group: 'How we reach you', needs: 'contact' },
  { index: 5, id: 'ps-email', label: 'Email address', group: 'How we reach you', needs: 'none' },
  { index: 6, id: 'ps-notifications', label: 'Notifications', group: 'How we reach you', needs: 'settings' },

  { index: 7, id: 'ps-security', label: 'Password and 2FA', group: 'Safety', needs: 'settings' },
  { index: 8, id: 'ps-sessions', label: 'Active sessions', group: 'Safety', needs: 'none' },
  { index: 9, id: 'ps-logins', label: 'Sign-in history', group: 'Safety', needs: 'none' },

  { index: 10, id: 'ps-privacy', label: 'Privacy', group: 'Your choices', needs: 'settings' },
  { index: 11, id: 'ps-appearance', label: 'Appearance and language', group: 'Your choices', needs: 'settings' },

  { index: 12, id: 'ps-social', label: 'Connected accounts', group: 'Integrations', needs: 'none' },
  { index: 13, id: 'ps-apikeys', label: 'API keys', group: 'Integrations', needs: 'none' },

  { index: 14, id: 'ps-device', label: 'This device', group: 'This device', needs: 'settings' },
];

export const STEP_GROUPS = ['Your account', 'How we reach you', 'Safety', 'Your choices', 'Integrations', 'This device'] as const;

export function stepById(id: string): StepDef | undefined {
  return STEPS.find((s) => s.id === id);
}
