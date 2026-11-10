import { store } from '../../../store/store';
import { toast } from '../../../components/ui';
import { savePreference, type PrefKey } from '../../../services/preferences';
import { COMMON_CURRENCIES } from '../../../services/locale';
import { useSupportedCurrencies } from '../../../services/currency';
import { Card } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 11 — how the app looks and speaks to you.
 *
 * The three pickers used to be local-only: a toast said "Currency → USD", the
 * value applied, and the next load replaced it with the stored document — the
 * choice reverted while the message claiming it was saved was still on screen.
 * They now share one write path (services/preferences.ts) with the menu bar, so
 * both entry points either save on the server or put back what was there.
 */

export function PreferencesCard({ data }: { data: SettingsData }) {
  const st = store.state;
  const allCurrencies = useSupportedCurrencies();

  const pick = async (key: PrefKey, label: string, value: string) => {
    const res = await savePreference(key, value, label);
    toast(res.message, res.ok);
  };

  return (
    <Card
      title="Appearance and language"
      hint="Saved to your account, so another device or a later sign-in opens the way you left it."
      missing={data.has('settings') ? undefined : 'the preferences section of your settings'}
      onRetry={data.reload}
      busy={data.loading}
    >
      <div className="field">
        <label>Theme accent</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {['gold', 'cyan', 'purple', 'emerald'].map((a) => (
            <button
              key={a}
              className={'btn ' + (st.prefs.accent === a ? 'btn-primary' : 'btn-ghost')}
              aria-pressed={st.prefs.accent === a}
              onClick={() => void pick('accent', 'Accent', a)}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="ps-note">Changes the highlight colour across the app, including buttons and charts.</div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>Currency</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {COMMON_CURRENCIES.map((c) => (
            <button
              key={c}
              className={'btn ' + (st.prefs.currency === c ? 'btn-primary' : 'btn-ghost')}
              aria-pressed={st.prefs.currency === c}
              onClick={() => void pick('currency', 'Currency', c)}
            >
              {c}
            </button>
          ))}
        </div>
        {allCurrencies.length > 0 && (
          <select
            className="input"
            aria-label="Other currencies"
            style={{ maxWidth: 260, marginTop: 8 }}
            value={COMMON_CURRENCIES.includes(st.prefs.currency) ? '' : st.prefs.currency}
            onChange={(e) => { if (e.target.value) void pick('currency', 'Currency', e.target.value); }}
          >
            <option value="">More currencies…</option>
            {allCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="ps-note">Only how figures are shown. Every transfer still settles in the currency the network uses.</div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>Language</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {['EN', 'FR', 'ES', 'SW'].map((l) => (
            <button
              key={l}
              className={'btn ' + (st.prefs.lang === l ? 'btn-primary' : 'btn-ghost')}
              aria-pressed={st.prefs.lang === l}
              onClick={() => void pick('lang', 'Language', l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
