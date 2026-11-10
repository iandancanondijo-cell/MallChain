/**
 * Preference writes — one path for both entry points that offer them.
 *
 * Accent, currency and language are pickable in two places: the top bar menu
 * and Profile & Settings. Only the Settings copy ever wrote to the server, so
 * from the top bar a pick applied, toasted itself as if saved ("Currency → USD"),
 * and then the next Settings load replaced `st.prefs` with the stored document
 * and quietly reverted it. The three handlers in Settings had the opposite
 * problem: they awaited the write, ignored the answer, and announced success
 * before the server had any say.
 *
 * Both now go through here: apply locally so the change is immediate, send just
 * the one key (`PUT /api/settings` merges per section), and if the server
 * refuses, put back exactly what was there before — DOM side effects included —
 * and say so instead of claiming a save that did not happen.
 */
import { store } from '../store/store';
import { settingsApi, type UserSettingsData } from './settingsApi';
import { applyAccent, resolveAccent } from './theme';

export type PrefKey = 'accent' | 'currency' | 'lang';

/**
 * The local half of a preference: the store value, the theme custom properties
 * and `<html lang>` that go with it. Callers use this to adopt a value the
 * server already holds — Settings' load mirrors the stored document into the
 * store, and until it went through here the theme variables were only applied
 * at app mount, so a saved accent change rendered one page load late.
 */
export function applyPreference(key: PrefKey, value: string): void {
  const st = store.state;
  if (key === 'accent') {
    const accent = resolveAccent(value);
    st.prefs.accent = accent;
    applyAccent(accent);
  } else if (key === 'currency') {
    st.prefs.currency = value as UserSettingsData['prefs']['currency'];
  } else {
    st.prefs.lang = value as typeof st.prefs.lang;
    document.documentElement.lang = value.toLowerCase();
  }
  store.commit();
}

export interface PrefResult {
  ok: boolean;
  /** Ready to show as-is: what the account now holds, or why it does not. */
  message: string;
}

/**
 * `label` is what a person sees ("Accent", "Theme"); `key` is the API field.
 * The message is built here because both entry points show the same sentence
 * and neither should get to claim a save the answer did not confirm.
 */
export async function savePreference(key: PrefKey, value: string, label: string = key): Promise<PrefResult> {
  const previous = store.state.prefs[key];
  applyPreference(key, value);

  const res = await settingsApi.update({ prefs: { [key]: value } });
  if (!res.ok) {
    applyPreference(key, previous);
    return { ok: false, message: res.error || `That ${label.toLowerCase()} was not saved.` };
  }

  // The answer is the stored document, so it wins over the value just sent.
  const stored = res.data?.prefs?.[key] || value;
  if (stored !== value) applyPreference(key, stored);
  return {
    ok: true,
    message: stored === value
      ? `${label} → ${value}`
      : `${label} → ${stored} — the account kept that instead.`,
  };
}
