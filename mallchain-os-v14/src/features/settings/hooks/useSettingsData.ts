import { useCallback, useEffect, useMemo, useState } from 'react';
import { store } from '../../../store/store';
import { applyPreference } from '../../../services/preferences';
import { minesApi, type MinesProfile } from '../../../services/minesApi';
import { settingsApi, type ContactInfo, type UserSettingsData } from '../../../services/settingsApi';
import { sessionApi, type SessionPolicy } from '../../../services/sessionApi';
import { kycApi, type KycStatusResponse } from '../../../services/kycApi';

/**
 * Everything Profile & Settings reads, in one place, so a section can say
 * "this part could not be read" instead of rendering a dash that looks like an
 * answer.
 *
 * The page used to keep five separate useState cells and four loads tangled
 * through them; a settings document that failed to arrive silently removed the
 * notification, privacy and phone panels, which is indistinguishable from an
 * account that never enabled anything. Same rule here, one level down: every
 * read is reported, and every write answers to the server.
 */

/** One section (or several) of the settings document, exactly as
 *  settingsApi.update accepts it — a patch that omits a section leaves that
 *  section alone on the server (backend/src/routes/settings.js merges per key). */
export type SettingsPatch = Parameters<typeof settingsApi.update>[0];

/** Older documents were created before sms/whatsapp existed on the model. */
const EMPTY_CHANNEL = {
  transactions: false, campaigns: false, governance: false, marketing: false,
  security: false, badgeAlerts: false,
};

function normalizeSettings(s: UserSettingsData): UserSettingsData {
  return {
    ...s,
    notifications: {
      ...s.notifications,
      sms: s.notifications.sms ?? { ...EMPTY_CHANNEL },
      whatsapp: s.notifications.whatsapp ?? { ...EMPTY_CHANNEL },
    },
  };
}

/**
 * Merge a patch into the loaded document section by section, mirroring
 * backend/src/routes/settings.js: a section the patch does not mention keeps
 * its stored value, and a mentioned section is merged rather than replaced, so
 * flipping one notification cell cannot silently delete the other five.
 */
function mergeSections(current: UserSettingsData, patch: SettingsPatch): UserSettingsData {
  return {
    ...current,
    ...(patch.prefs ? { prefs: { ...current.prefs, ...patch.prefs } } : {}),
    ...(patch.display ? { display: { ...current.display, ...patch.display } } : {}),
    ...(patch.privacy ? { privacy: { ...current.privacy, ...patch.privacy } } : {}),
    ...(patch.security ? { security: { ...current.security, ...patch.security } } : {}),
    ...(patch.notifications
      ? {
        notifications: {
          ...current.notifications,
          ...patch.notifications,
          email: { ...current.notifications.email, ...patch.notifications.email },
          push: { ...current.notifications.push, ...patch.notifications.push },
          sms: { ...current.notifications.sms, ...patch.notifications.sms },
          whatsapp: { ...current.notifications.whatsapp, ...patch.notifications.whatsapp },
        },
      }
      : {}),
  };
}

export interface DataGap {
  /** Which section is missing its data, so only that section goes quiet. */
  id: 'profile' | 'settings' | 'kyc' | 'contact';
  /** Written for a person, and specific about what they cannot do yet. */
  sentence: string;
}

export interface WriteResult {
  ok: boolean;
  message: string;
}

export interface SettingsData {
  loading: boolean;
  /** False until the first read attempt has finished — the difference between
   *  "reading your account" and a page full of dashes. */
  loadedOnce: boolean;
  gaps: DataGap[];
  reload: () => Promise<void>;

  profile: MinesProfile | null;
  settings: UserSettingsData | null;
  kyc: KycStatusResponse | null;
  contact: ContactInfo | null;

  /**
   * The session lifetime the server actually signs tokens with
   * (`GET /api/sessions` → policy), as opposed to the stored preference in
   * `settings.security.sessionTimeout`. They are different numbers: the
   * preference may be unset, and it can only ever shorten the server policy,
   * never extend it. Legacy documents carry a 120-minute preference written
   * before the control was limited to 5/15/30, so displaying the stored value
   * alone tells the account a session it will never get.
   *
   * Null when the read failed. It is not added to `gaps` because the card that
   * uses it has a truthful fallback — it just has to say the number is the
   * account's preference rather than the server's answer.
   */
  sessionPolicy: SessionPolicy | null;

  has: (id: DataGap['id']) => boolean;
  setContact: (next: ContactInfo | null) => void;

  /**
   * PUT one or more sections and let the server's answer decide what the page
   * shows. A refused write rolls the optimistic change back; an accepted one
   * adopts the merged document the route returns, not the value that was sent.
   */
  save: (patch: SettingsPatch, label: string) => Promise<WriteResult>;
}

export function useSettingsData(): SettingsData {
  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [kyc, setKyc] = useState<KycStatusResponse | null>(null);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicy | null>(null);
  const [gaps, setGaps] = useState<DataGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    // Each read fails on its own — a rejection becomes null so the four results
    // keep their types instead of collapsing into one union.
    const [profileRes, settingsRes, kycRes, contactRes, sessionsRes] = await Promise.all([
      minesApi.getProfile().catch(() => null),
      settingsApi.get().catch(() => null),
      kycApi.getStatus().catch(() => null),
      settingsApi.getContact().catch(() => null),
      sessionApi.listSessions().catch(() => null),
    ]);

    const missing: DataGap[] = [];

    if (profileRes?.ok && profileRes.data) {
      setProfile(profileRes.data);
    } else {
      missing.push({
        id: 'profile',
        sentence: 'Your profile — the handle, the display number and the Mallpoints figure.',
      });
    }

    if (settingsRes?.ok && settingsRes.data) {
      const doc = normalizeSettings(settingsRes.data);
      setSettings(doc);
      // Mirror into the local store so the rest of the app (currency formatting,
      // accent, language) stays reactive without a refactor. This goes through
      // the same renderer a click uses, which is why a saved accent also reaches
      // the CSS variables on load instead of one page load later.
      applyPreference('accent', doc.prefs.accent);
      // No backend value yet means the user never chose a currency — keep the
      // browser-locale default (store.ts) rather than overwriting it with an
      // arbitrary server default.
      if (doc.prefs.currency) applyPreference('currency', doc.prefs.currency);
      applyPreference('lang', doc.prefs.lang);
    } else {
      missing.push({
        id: 'settings',
        sentence: 'Your preferences, notifications, privacy and security settings.',
      });
    }

    if (kycRes?.ok && kycRes.data) {
      setKyc(kycRes.data);
    } else {
      missing.push({
        id: 'kyc',
        sentence: 'The identity verification record — so nothing here can say whether you are verified.',
      });
    }

    if (contactRes?.ok && contactRes.data) {
      setContact(contactRes.data);
    } else {
      missing.push({
        id: 'contact',
        sentence: 'The verified contact number — so the SMS/WhatsApp status below cannot be trusted.',
      });
    }

    // Not a gap: "This device" can still state the account's own preference if
    // this fails, it just cannot claim the number is what the server grants.
    setSessionPolicy(sessionsRes?.ok && sessionsRes.data ? sessionsRes.data.policy : null);

    setGaps(missing);
    setLoadedOnce(true);
    setLoading(false);
  }, []);

  const has = useCallback(
    (id: DataGap['id']) => !gaps.some((g) => g.id === id),
    [gaps],
  );

  const save = useCallback<SettingsData['save']>(async (patch, label) => {
    if (!settings) {
      // There is no document to merge into, and the optimistic flip the caller
      // just painted would then be a claim about a setting nobody saved.
      return { ok: false, message: 'Your settings are still loading — try again in a second.' };
    }
    const previous = settings;
    // Deep-merged per section, the same way the route merges a patch
    // (backend/src/routes/settings.js): a section the patch does not mention
    // keeps its stored value, so the optimistic document can never be a
    // half-written one that the server's answer then contradicts.
    setSettings(normalizeSettings(mergeSections(previous, patch)));

    const res = await settingsApi.update(patch);
    if (!res.ok) {
      setSettings(previous);
      return { ok: false, message: res.error || `That ${label.toLowerCase()} was not saved.` };
    }
    if (res.data) {
      // The route answers with the document it actually stored — that is what
      // gets shown, not what was sent.
      setSettings(normalizeSettings(res.data));
    }
    return { ok: true, message: `${label} saved.` };
  }, [settings]);

  // A sign-out or account switch must not leave the previous person's profile,
  // KYC verdict or contact number on screen — the same leak class already
  // hunted on the wallet and dashboard. Clearing is only half of it: the page
  // also re-reads, or it would sit on "reading your account…" with no request
  // in flight, which is the dash-that-looks-like-an-answer failure again.
  const accountId = store.state.user.id;
  useEffect(() => {
    setProfile(null);
    setSettings(null);
    setKyc(null);
    setContact(null);
    setSessionPolicy(null);
    setGaps([]);
    setLoadedOnce(false);
    void reload();
  }, [accountId, reload]);

  return useMemo<SettingsData>(
    () => ({
      loading, loadedOnce, gaps, reload, profile, settings, kyc, contact, sessionPolicy, has, setContact, save,
    }),
    [loading, loadedOnce, gaps, reload, profile, settings, kyc, contact, sessionPolicy, has, save],
  );
}
