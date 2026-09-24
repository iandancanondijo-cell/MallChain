import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { config } from '../../services/config';
import { COMMON_CURRENCIES } from '../../services/locale';
import { useSupportedCurrencies } from '../../services/currency';
import { settingsApi, type UserSettingsData, type ContactInfo } from '../../services/settingsApi';

/** Settings — real per-user preferences/notifications/security/privacy (backend/src/routes/settings.js). */

// Defaults for notification channels that may be missing from older settings
// documents created before sms/whatsapp were added to the model.
const EMPTY_NOTIF = { transactions: false, campaigns: false, governance: false, marketing: false, security: false, badgeAlerts: false };

/** Ensure every notification channel section exists — older docs may lack sms/whatsapp. */
function normalizeSettings(s: UserSettingsData): UserSettingsData {
  return {
    ...s,
    notifications: {
      ...s.notifications,
      sms: s.notifications.sms ?? { ...EMPTY_NOTIF },
      whatsapp: s.notifications.whatsapp ?? { ...EMPTY_NOTIF },
    },
  };
}

export default function Settings() {
  useStoreVersion();
  const st = store.state;
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const allCurrencies = useSupportedCurrencies();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await settingsApi.get();
    if (res.ok && res.data) {
      const normalized = normalizeSettings(res.data);
      setSettings(normalized);
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
    // Load contact info for notification channels
    const contactRes = await settingsApi.getContact();
    if (contactRes.ok && contactRes.data) {
      setContact(contactRes.data);
      if (contactRes.data.phoneNumber) setPhoneInput(contactRes.data.phoneNumber);
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

  const toggleNotif = async (channel: 'email' | 'push' | 'sms' | 'whatsapp', key: string, value: boolean) => {
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
            <div className="flag-row" style={{ marginBottom: 8 }}>
              <div className="desc"><div className="t">Category</div></div>
              <span className="tiny" style={{ width: 48, textAlign: 'center' }}>email</span>
              <span className="tiny" style={{ width: 48, textAlign: 'center' }}>push</span>
              <span className="tiny" style={{ width: 48, textAlign: 'center' }}>SMS</span>
              <span className="tiny" style={{ width: 56, textAlign: 'center' }}>WhatsApp</span>
            </div>
            {(['transactions', 'campaigns', 'governance', 'security', 'badgeAlerts'] as const).map((key) => (
              <div key={key} className="flag-row">
                <div className="desc"><div className="t">{key}</div></div>
                <label className="switch"><input type="checkbox" aria-label={`Email notifications for ${key}`} checked={settings.notifications.email[key]} onChange={(e) => toggleNotif('email', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
                <label className="switch"><input type="checkbox" aria-label={`Push notifications for ${key}`} checked={settings.notifications.push[key]} onChange={(e) => toggleNotif('push', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
                <label className="switch"><input type="checkbox" aria-label={`SMS notifications for ${key}`} checked={settings.notifications.sms?.[key] ?? false} onChange={(e) => toggleNotif('sms', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
                <label className="switch"><input type="checkbox" aria-label={`WhatsApp notifications for ${key}`} checked={settings.notifications.whatsapp?.[key] ?? false} onChange={(e) => toggleNotif('whatsapp', key, e.target.checked)} /><span className="track" /><span className="knob" /></label>
              </div>
            ))}
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Notification Channels</h2><span className="sub">Connect WhatsApp & verify phone for SMS/WhatsApp alerts</span></div>

            {/* Phone number section */}
            <div style={{ marginBottom: 16 }}>
              <div className="t" style={{ marginBottom: 6, fontWeight: 600 }}>Phone Number</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="tel"
                  placeholder="+254712345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  style={{ maxWidth: 220 }}
                  disabled={contact?.phoneVerified ?? false}
                />
                {contact?.phoneVerified ? (
                  <span className="chip" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)' }}>Verified</span>
                ) : (
                  <button
                    className="btn btn-ghost"
                    disabled={contactLoading || !/^\+[1-9]\d{1,14}$/.test(phoneInput)}
                    onClick={async () => {
                      setContactLoading(true);
                      const r = await settingsApi.updateContact({ phoneNumber: phoneInput });
                      if (r.ok) {
                        const otpRes = await settingsApi.sendPhoneOtp();
                        if (otpRes.ok) {
                          setOtpSent(true);
                          toast(otpRes.data?.otp ? `OTP sent (dev: ${otpRes.data.otp})` : 'OTP sent to your phone');
                        }
                      } else {
                        toast(r.error || 'Failed to save phone number');
                      }
                      setContactLoading(false);
                    }}
                  >
                    {contactLoading ? 'Sending…' : 'Verify Phone'}
                  </button>
                )}
              </div>
            </div>

            {/* OTP verification section */}
            {otpSent && !contact?.phoneVerified && (
              <div style={{ marginBottom: 16 }}>
                <div className="t" style={{ marginBottom: 6, fontWeight: 600 }}>Enter Verification Code</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="6-digit code"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    maxLength={6}
                    style={{ maxWidth: 160 }}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={contactLoading || otpInput.length !== 6}
                    onClick={async () => {
                      setContactLoading(true);
                      const r = await settingsApi.verifyPhone(otpInput);
                      if (r.ok) {
                        setContact((prev) => prev ? { ...prev, phoneVerified: true, phoneVerifiedAt: new Date().toISOString() } : prev);
                        setOtpSent(false);
                        setOtpInput('');
                        toast('Phone verified');
                      } else {
                        toast(r.error || 'Invalid OTP');
                      }
                      setContactLoading(false);
                    }}
                  >
                    Verify
                  </button>
                </div>
              </div>
            )}

            {/* WhatsApp opt-in section */}
            <div>
              <div className="t" style={{ marginBottom: 6, fontWeight: 600 }}>WhatsApp Notifications</div>
              {contact?.phoneVerified ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      aria-label="Enable WhatsApp notifications"
                      checked={contact?.whatsappOptIn ?? false}
                      onChange={async (e) => {
                        setContactLoading(true);
                        const r = e.target.checked
                          ? await settingsApi.optInWhatsApp()
                          : await settingsApi.optOutWhatsApp();
                        if (r.ok) {
                          setContact((prev) => prev ? { ...prev, whatsappOptIn: e.target.checked } : prev);
                          toast(e.target.checked ? 'WhatsApp notifications enabled' : 'WhatsApp notifications disabled');
                        } else {
                          toast(r.error || 'Failed to update WhatsApp settings');
                        }
                        setContactLoading(false);
                      }}
                    />
                    <span className="track" /><span className="knob" />
                  </label>
                  <span className="tiny">{contact?.whatsappOptIn ? 'Connected — wallet alerts via WhatsApp' : 'Off — toggle to receive wallet alerts on WhatsApp'}</span>
                </div>
              ) : (
                <div className="tiny" style={{ opacity: 0.6 }}>Verify your phone number above to enable WhatsApp notifications</div>
              )}
            </div>
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
