import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { config } from '../../services/config';
import { COMMON_CURRENCIES } from '../../services/locale';
import { useSupportedCurrencies } from '../../services/currency';
import { settingsApi, type UserSettingsData } from '../../services/settingsApi';

/** Settings — real per-user preferences/notifications/security/privacy (backend/src/routes/settings.js). */
export default function Settings() {
  useStoreVersion();
  const st = store.state;
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const allCurrencies = useSupportedCurrencies();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await settingsApi.get();
    if (res.ok && res.data) {
      setSettings(res.data);
      // Mirror into the local store so the rest of the app (currency
      // formatting, accent color, etc.) stays reactive without a refactor.
      st.prefs.accent = res.data.prefs.accent as never;
      // No backend value yet means the user hasn't explicitly chosen a
      // currency — keep the browser-locale-detected default (store.ts)
      // rather than overwriting it with an arbitrary server default.
      if (res.data.prefs.currency) st.prefs.currency = res.data.prefs.currency as never;
      st.prefs.lang = res.data.prefs.lang as never;
      store.commit();
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyAccent = async (a: string) => {
    const map: Record<string, string> = { gold: '#f3ba2f', cyan: '#22d3ee', purple: '#a78bfa', emerald: '#34d399' };
    document.documentElement.style.setProperty('--accent', map[a]);
    st.prefs.accent = a as never;
    store.commit();
    await settingsApi.update({ prefs: { ...settings?.prefs, accent: a } as UserSettingsData['prefs'] });
    toast('Accent → ' + a);
  };

  const setCurrency = async (c: string) => {
    st.prefs.currency = c as never;
    store.commit();
    await settingsApi.update({ prefs: { ...settings?.prefs, currency: c } as UserSettingsData['prefs'] });
    toast('Currency → ' + c);
  };

  const setLang = async (l: string) => {
    st.prefs.lang = l as never;
    store.commit();
    await settingsApi.update({ prefs: { ...settings?.prefs, lang: l } as UserSettingsData['prefs'] });
    toast('Language → ' + l);
  };

  const toggleNotif = async (channel: 'email' | 'push', key: string, value: boolean) => {
    if (!settings) return;
    const updated = { ...settings, notifications: { ...settings.notifications, [channel]: { ...settings.notifications[channel], [key]: value } } };
    setSettings(updated);
    await settingsApi.update({ notifications: updated.notifications });
  };

  const togglePrivacy = async (key: keyof UserSettingsData['privacy'], value: boolean | string) => {
    if (!settings) return;
    const updated = { ...settings, privacy: { ...settings.privacy, [key]: value } };
    setSettings(updated);
    await settingsApi.update({ privacy: updated.privacy });
  };

  return (
    <div>
      <div className="view-head"><h1>Settings</h1><span className="sub">real per-account preferences</span></div>

      <div className="card mb">
        <div className="sec-title"><h2>Theme accent</h2></div>
        <div className="row">
          {['gold', 'cyan', 'purple', 'emerald'].map((a) => (
            <button key={a} className={'btn ' + (st.prefs.accent === a ? 'btn-primary' : 'btn-ghost')} onClick={() => applyAccent(a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Currency</h2></div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {COMMON_CURRENCIES.map((c) => (
            <button key={c} className={'btn ' + (st.prefs.currency === c ? 'btn-primary' : 'btn-ghost')} onClick={() => setCurrency(c)}>{c}</button>
          ))}
        </div>
        {allCurrencies.length > 0 && (
          <select
            className="input mt"
            style={{ maxWidth: 260 }}
            value={COMMON_CURRENCIES.includes(st.prefs.currency) ? '' : st.prefs.currency}
            onChange={(e) => { if (e.target.value) setCurrency(e.target.value); }}
          >
            <option value="">More currencies…</option>
            {allCurrencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Language</h2></div>
        <div className="row">
          {['EN', 'FR', 'ES', 'SW'].map((l) => (
            <button key={l} className={'btn ' + (st.prefs.lang === l ? 'btn-primary' : 'btn-ghost')} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
      </div>

      {!loading && settings && (
        <>
          <div className="card mb">
            <div className="sec-title"><h2>Notifications</h2></div>
            {(['transactions', 'campaigns', 'governance', 'security'] as const).map((key) => (
              <div key={key} className="flag-row">
                <div className="desc"><div className="t">{key}</div></div>
                <label className="switch"><input type="checkbox" aria-label={`Email notifications for ${key}`} checked={settings.notifications.email[key]} onChange={(e) => toggleNotif('email', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
                <span className="tiny">email</span>
                <label className="switch"><input type="checkbox" aria-label={`Push notifications for ${key}`} checked={settings.notifications.push[key]} onChange={(e) => toggleNotif('push', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
                <span className="tiny">push</span>
              </div>
            ))}
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Privacy</h2></div>
            <div className="flag-row">
              <div className="desc"><div className="t">Show my balance to others</div></div>
              <label className="switch"><input type="checkbox" aria-label="Show my balance to others" checked={settings.privacy.showBalance} onChange={(e) => togglePrivacy('showBalance', e.target.checked)} /><span className="track" /><span className="knob" /></label>
            </div>
            <div className="flag-row">
              <div className="desc"><div className="t">Show my activity</div></div>
              <label className="switch"><input type="checkbox" aria-label="Show my activity" checked={settings.privacy.showActivity} onChange={(e) => togglePrivacy('showActivity', e.target.checked)} /><span className="track" /><span className="knob" /></label>
            </div>
            <div className="flag-row">
              <div className="desc"><div className="t">Allow direct messages</div></div>
              <label className="switch"><input type="checkbox" aria-label="Allow direct messages" checked={settings.privacy.allowMessages} onChange={(e) => togglePrivacy('allowMessages', e.target.checked)} /><span className="track" /><span className="knob" /></label>
            </div>
          </div>
        </>
      )}

      <div className="card mb">
        <div className="sec-title"><h2>Network</h2></div>
        <div className="flag-row">
          <div className="desc"><div className="t">Network</div></div>
          <span className="chip gold">{config.network}</span>
        </div>
      </div>

      <div className="card">
        <div className="sec-title"><h2>Storage</h2></div>
        <div className="flag-row">
          <div className="desc"><div className="t">Local store</div><div className="m">key <span className="mono">mallchain_os_v1_v14</span> in localStorage</div></div>
          <button className="btn btn-danger" onClick={() => { if (window.confirm('Reset all local data?')) { localStorage.removeItem('mallchain_os_v1_v14'); window.location.reload(); } }}>Reset all data</button>
        </div>
      </div>
    </div>
  );
}
