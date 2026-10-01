import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Modal, BadgeCheckmark } from '../../components/ui';
import { config } from '../../services/config';
import { COMMON_CURRENCIES } from '../../services/locale';
import { useSupportedCurrencies } from '../../services/currency';
import { minesApi, type MinesProfile } from '../../services/minesApi';
import { settingsApi, type UserSettingsData, type ContactInfo } from '../../services/settingsApi';
import { kycApi, type KycStatusResponse } from '../../services/kycApi';
import { api } from '../../services/api';
import { badgeApi, type BadgeConfig, type BadgeQuote } from '../../services/badgeApi';

/** Profile & Settings — one page combining real username/phone (backend/src/routes/mines.js),
 *  real 2FA / preferences / notifications / privacy (backend/src/routes/settings.js),
 *  real KYC detail (backend/src/routes/kyc.js) and badge purchase (badgeApi). */

const STATUS_LABEL: Record<KycStatusResponse['status'], string> = {
  not_submitted: 'Not submitted',
  pending: 'Under review',
  review: 'Under review',
  approved: 'Verified',
  rejected: 'Rejected',
};
const STATUS_COLOR: Record<KycStatusResponse['status'], string> = {
  not_submitted: 'var(--txt-3)',
  pending: 'var(--gold)',
  review: 'var(--gold)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
};

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className="tiny">{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

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

  // Profile state
  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [kyc, setKyc] = useState<KycStatusResponse | null>(null);
  const [docModal, setDocModal] = useState<{ blobUrl: string; loading: boolean } | null>(null);

  // Settings state
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const allCurrencies = useSupportedCurrencies();

  // Badge state
  const [badgeConfig, setBadgeConfig] = useState<BadgeConfig | null>(null);
  const [buyBadgeOpen, setBuyBadgeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [profileRes, settingsRes, kycRes, contactRes] = await Promise.all([
      minesApi.getProfile(),
      settingsApi.get(),
      kycApi.getStatus(),
      settingsApi.getContact(),
    ]);
    if (profileRes.ok && profileRes.data) {
      setProfile(profileRes.data);
      setUsername(profileRes.data.username || '');
      setPhone(profileRes.data.phone || '');
    }
    if (settingsRes.ok && settingsRes.data) {
      setTwoFactorEnabled(settingsRes.data.security.twoFactorEnabled);
      const normalized = normalizeSettings(settingsRes.data);
      setSettings(normalized);
      // Mirror into the local store so the rest of the app (currency
      // formatting, accent color, etc.) stays reactive without a refactor.
      st.prefs.accent = settingsRes.data.prefs.accent as never;
      // No backend value yet means the user hasn't explicitly chosen a
      // currency — keep the browser-locale-detected default (store.ts)
      // rather than overwriting it with an arbitrary server default.
      if (settingsRes.data.prefs.currency) st.prefs.currency = settingsRes.data.prefs.currency as never;
      st.prefs.lang = settingsRes.data.prefs.lang as never;
      store.commit();
    }
    if (kycRes.ok && kycRes.data) setKyc(kycRes.data);
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

  useEffect(() => {
    badgeApi.getConfig().then((r) => { if (r.ok && r.data) setBadgeConfig(r.data); });
  }, []);

  const save = async () => {
    if (!username.trim()) return toast('Username cannot be empty', false);
    setSaving(true);
    const res = await minesApi.updateProfile({ username: username.trim(), phone: phone.trim() || undefined });
    if (res.ok) {
      // Username is a handle, not the display identity — st.user.name is
      // KYC-derived (see App.tsx's session sync) and must not be silently
      // overwritten here, or it visibly "reverts" on next reload. Re-resolve
      // it the same authoritative way App.tsx does, from the real backend
      // record, instead of guessing from the field just saved.
      const meRes = await api.get<{ user?: { name?: string | null; username?: string | null; email?: string } }>('/api/auth/me');
      if (meRes.ok && meRes.data?.user) {
        const u = meRes.data.user;
        const realName = u.name || u.username || u.email?.split('@')[0];
        if (realName) {
          st.user.name = realName;
          st.user.avatarInitial = realName[0]?.toUpperCase() || st.user.avatarInitial;
        }
      }
      store.commit();
      toast('Profile updated');
      load();
    } else {
      toast(res.error || 'Failed to update profile', false);
    }
    setSaving(false);
  };

  // 2FA
  const [setup2fa, setSetup2fa] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [showDisable2fa, setShowDisable2fa] = useState(false);

  const startEnable2fa = async () => {
    const res = await settingsApi.setup2fa();
    if (res.ok && res.data) { setSetup2fa(res.data); setVerifyCode(''); }
    else toast(res.error || 'Failed to start 2FA setup', false);
  };

  const confirmEnable2fa = async () => {
    if (!verifyCode) return;
    setVerifying(true);
    const res = await settingsApi.enable2fa(verifyCode);
    setVerifying(false);
    if (res.ok && res.data) {
      setTwoFactorEnabled(true);
      setSetup2fa(null);
      setBackupCodes(res.data.backupCodes);
      toast('2FA enabled');
    } else {
      toast(res.error || 'Invalid code', false);
    }
  };

  const confirmDisable2fa = async () => {
    if (!disableCode) return;
    setDisabling(true);
    const res = await settingsApi.disable2fa(disableCode);
    setDisabling(false);
    if (res.ok) {
      setTwoFactorEnabled(false);
      setShowDisable2fa(false);
      setDisableCode('');
      toast('2FA disabled');
    } else {
      toast(res.error || 'Failed to disable 2FA', false);
    }
  };

  // Password
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const changePassword = async () => {
    if (!pwOld || !pwNew) return;
    setChangingPw(true);
    const res = await settingsApi.changePassword(pwOld, pwNew);
    setChangingPw(false);
    if (res.ok) {
      setShowChangePw(false);
      setPwOld('');
      setPwNew('');
      toast('Password changed');
    } else {
      toast(res.error || 'Failed to change password', false);
    }
  };

  // KYC document viewer
  const viewDocument = async () => {
    if (!kyc?.kycId) return;
    setDocModal({ blobUrl: '', loading: true });
    const res = await kycApi.fetchDocumentBlobUrl(kyc.kycId);
    if (res.ok && res.data) setDocModal({ blobUrl: res.data, loading: false });
    else {
      toast(res.error || 'Failed to load document', false);
      setDocModal(null);
    }
  };
  const closeDocModal = () => {
    if (docModal?.blobUrl) URL.revokeObjectURL(docModal.blobUrl);
    setDocModal(null);
  };

  // Preferences
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

  const identityVerified = kyc?.status === 'approved';

  return (
    <div>
      <div className="view-head"><h1>Profile &amp; Settings</h1><span className="sub">your identity, security, and preferences</span></div>

      {/* Verification checklist — quick glance at what's actually confirmed vs not */}
      <div className="card mb">
        <div className="sec-title"><h2>Verification status</h2></div>
        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          <div className="flag-row" style={{ flex: '1 1 200px' }}>
            <div className="desc"><div className="t">Identity (KYC)</div><div className="m">from your submitted documents</div></div>
            <span className="chip" style={{ color: STATUS_COLOR[kyc?.status || 'not_submitted'], borderColor: STATUS_COLOR[kyc?.status || 'not_submitted'] }}>
              {identityVerified ? '✓ ' : ''}{STATUS_LABEL[kyc?.status || 'not_submitted']}
            </span>
          </div>
          <div className="flag-row" style={{ flex: '1 1 200px' }}>
            <div className="desc"><div className="t">Two-factor auth</div><div className="m">authenticator app</div></div>
            <span className="chip" style={{ color: twoFactorEnabled ? 'var(--green)' : 'var(--txt-3)' }}>{twoFactorEnabled ? '✓ Enabled' : 'Not enabled'}</span>
          </div>
          <div className="flag-row" style={{ flex: '1 1 200px' }}>
            <div className="desc"><div className="t">Wallet</div><div className="m">Mallchain address</div></div>
            <span className="chip" style={{ color: st.wallet.address ? 'var(--green)' : 'var(--txt-3)' }}>{st.wallet.address ? '✓ Connected' : 'Not connected'}</span>
          </div>
          <div className="flag-row" style={{ flex: '1 1 200px' }}>
            <div className="desc"><div className="t">Mallchain badge</div><div className="m">7-day activity streak, or buy it</div></div>
            {st.user.hasBadge ? (
              <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>✓ Active</span>
            ) : st.wallet.address ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="chip" style={{ color: 'var(--txt-3)' }}>Not earned</span>
                <button className="btn btn-primary btn-sm" onClick={() => setBuyBadgeOpen(true)}>
                  Buy for KSh {badgeConfig?.priceKes ?? 17}
                </button>
              </span>
            ) : (
              <span className="chip" style={{ color: 'var(--txt-3)' }}>Connect a wallet to buy</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card mb">
            <div className="sec-title"><h2>Edit profile</h2></div>
            <div className="row mb">
              <div className="avatar" style={{ width: 56, height: 56, fontSize: 24 }}>{st.user.avatarInitial}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{st.user.name}{st.user.hasBadge && <BadgeCheckmark />}</div>
                <div className="tiny">{profile?.email}</div>
              </div>
            </div>
            <div className="field">
              <label>Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} />
              <div className="tiny" style={{ marginTop: 4 }}>A handle for the app — separate from the verified name above, which comes from your KYC submission.</div>
            </div>
            <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7…" disabled={loading} /></div>
            <button className="btn btn-primary btn-block" onClick={save} disabled={saving || loading}>{saving && <span className="spin" />} Save changes</button>
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Account</h2></div>
            <div className="flag-row"><div className="desc"><div className="t">KYC level</div><div className="m">identity verification</div></div><span className="chip green">Level {st.user.kycLevel}</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Wallet</div><div className="m">your Mallchain address</div></div><span className="chip mono" style={{ fontSize: 11 }}>{st.wallet.address ? `${st.wallet.address.slice(0, 10)}…` : '—'}</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Status</div></div>{st.user.frozen ? <span className="frozen-badge">❄ Banned</span> : <span className="chip green">Active</span>}</div>
            <div className="flag-row"><div className="desc"><div className="t">Mallpoints balance</div></div><span className="chip">{profile?.mlpts_balance ?? '—'}</span></div>
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Security</h2></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => (twoFactorEnabled ? setShowDisable2fa(true) : startEnable2fa())}>
                {twoFactorEnabled ? '✓ 2FA enabled — disable' : 'Enable 2FA'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowChangePw(true)}>Change password</button>
            </div>
          </div>

          <div className="card mb">
            <div className="sec-title"><h2>Preferences</h2></div>
            <div className="field">
              <label>Theme accent</label>
              <div className="row">
                {['gold', 'cyan', 'purple', 'emerald'].map((a) => (
                  <button key={a} className={'btn ' + (st.prefs.accent === a ? 'btn-primary' : 'btn-ghost')} onClick={() => applyAccent(a)}>{a}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Currency</label>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {COMMON_CURRENCIES.map((c) => (
                  <button key={c} className={'btn ' + (st.prefs.currency === c ? 'btn-primary' : 'btn-ghost')} onClick={() => setCurrency(c)}>{c}</button>
                ))}
              </div>
              {allCurrencies.length > 0 && (
                <select
                  className="input"
                  style={{ maxWidth: 260, marginTop: 8 }}
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
            <div className="field">
              <label>Language</label>
              <div className="row">
                {['EN', 'FR', 'ES', 'SW'].map((l) => (
                  <button key={l} className={'btn ' + (st.prefs.lang === l ? 'btn-primary' : 'btn-ghost')} onClick={() => setLang(l)}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {!loading && settings && (
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
          )}
        </div>

        <div>
          <div className="card mb">
            <div className="sec-title">
              <h2>Identity verification (KYC)</h2>
              <span className="chip" style={{ marginLeft: 'auto', color: STATUS_COLOR[kyc?.status || 'not_submitted'], borderColor: STATUS_COLOR[kyc?.status || 'not_submitted'] }}>
                {STATUS_LABEL[kyc?.status || 'not_submitted']}
              </span>
            </div>

            {!kyc || kyc.status === 'not_submitted' ? (
              <p className="tiny">You haven't submitted identity verification yet. This is completed as part of account sign-up.</p>
            ) : (
              <>
                <p className="tiny" style={{ marginBottom: 10 }}>
                  Submitted {kyc.submittedAt ? new Date(kyc.submittedAt).toLocaleDateString() : '—'}
                  {kyc.reviewedAt && <> · reviewed {new Date(kyc.reviewedAt).toLocaleDateString()}</>}
                  {kyc.status === 'rejected' && kyc.notes && <> · reason: {kyc.notes}</>}
                </p>

                <div className="sec-title" style={{ marginTop: 4 }}><h2 style={{ fontSize: 12.5, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Personal</h2></div>
                <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
                  <Field label="First name" value={kyc.personal?.firstName} />
                  <Field label="Last name" value={kyc.personal?.lastName} />
                  <Field label="Date of birth" value={kyc.personal?.dateOfBirth ? new Date(kyc.personal.dateOfBirth).toLocaleDateString() : undefined} />
                  <Field label="Nationality" value={kyc.personal?.nationality} />
                </div>

                <div className="sec-title"><h2 style={{ fontSize: 12.5, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Address</h2></div>
                <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
                  <Field label="Address" value={kyc.address?.address} />
                  <Field label="City" value={kyc.address?.city} />
                  <Field label="Country" value={kyc.address?.country} />
                  <Field label="Postal code" value={kyc.address?.postalCode} />
                  <Field label="Phone on file" value={kyc.address?.phoneNumber} />
                </div>

                <div className="sec-title"><h2 style={{ fontSize: 12.5, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Identity document</h2></div>
                <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
                  <Field label="Document type" value={kyc.identity?.idType?.replace('_', ' ')} />
                  <Field label="Document number" value={kyc.identity?.idNumber} />
                  <Field label="Expires" value={kyc.identity?.idExpiry ? new Date(kyc.identity.idExpiry).toLocaleDateString() : undefined} />
                  <div>
                    <div className="tiny">On file</div>
                    {kyc.hasDocument ? (
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 2 }} onClick={viewDocument}>View document</button>
                    ) : (
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--txt-3)' }}>Not uploaded</div>
                    )}
                  </div>
                </div>

                <div className="sec-title"><h2 style={{ fontSize: 12.5, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Financial</h2></div>
                <div className="grid-2" style={{ gap: 10 }}>
                  <Field label="Occupation" value={kyc.financial?.occupation} />
                  <Field label="Source of funds" value={kyc.financial?.sourceOfFunds} />
                  <Field label="Annual income" value={kyc.financial?.annualIncome} />
                  <Field label="Politically exposed" value={kyc.financial?.politicalExposure ? 'Yes' : 'No'} />
                </div>
              </>
            )}
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
                <div className="sec-title"><h2>Notification Channels</h2><span className="sub">Connect WhatsApp &amp; verify phone for SMS/WhatsApp alerts</span></div>

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
            </>
          )}

          <div className="card">
            <div className="sec-title"><h2>App</h2></div>
            <div className="flag-row">
              <div className="desc"><div className="t">Network</div></div>
              <span className="chip gold">{config.network}</span>
            </div>
            <div className="flag-row">
              <div className="desc"><div className="t">Local store</div><div className="m">key <span className="mono">mallchain_os_v1_v14</span> in localStorage</div></div>
              <button className="btn btn-danger" onClick={() => { if (window.confirm('Reset all local data?')) { localStorage.removeItem('mallchain_os_v1_v14'); window.location.reload(); } }}>Reset all data</button>
            </div>
          </div>
        </div>
      </div>

      {docModal && (
        <Modal title="ID document" onClose={closeDocModal}>
          {docModal.loading ? (
            <div className="tiny" style={{ padding: 20 }}>Loading…</div>
          ) : (
            <img src={docModal.blobUrl} alt="ID document" style={{ maxWidth: '100%', borderRadius: 8 }} onError={() => window.open(docModal.blobUrl, '_blank')} />
          )}
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => window.open(docModal.blobUrl, '_blank')}>Open in new tab</button></div>
        </Modal>
      )}

      {setup2fa && (
        <Modal title="Enable two-factor authentication" onClose={() => setSetup2fa(null)}>
          <div className="tiny mb">Add this secret to your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it generates.</div>
          <div className="card" style={{ padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
            {setup2fa.secret}
          </div>
          <div className="field mb">
            <label>6-digit code</label>
            <input className="input" inputMode="numeric" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="123456" autoFocus />
          </div>
          <button className="btn btn-primary btn-block" disabled={verifying || !verifyCode} onClick={confirmEnable2fa}>
            {verifying && <span className="spin" />} Verify and enable
          </button>
        </Modal>
      )}

      {backupCodes && (
        <Modal title="Save your backup codes" onClose={() => setBackupCodes(null)}>
          <div className="tiny mb red">These are shown once. Each can be used in place of a code from your authenticator app if you lose access to it.</div>
          <div className="card" style={{ padding: 12, fontFamily: 'monospace', fontSize: 13, display: 'grid', gap: 4 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setBackupCodes(null)}>Done</button>
        </Modal>
      )}

      {showDisable2fa && (
        <Modal title="Disable two-factor authentication" onClose={() => setShowDisable2fa(false)}>
          <div className="tiny mb">Enter a current code from your authenticator app (or a backup code) to confirm.</div>
          <div className="field mb">
            <label>Code</label>
            <input className="input" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="123456 or backup code" autoFocus />
          </div>
          <button className="btn btn-danger btn-block" disabled={disabling || !disableCode} onClick={confirmDisable2fa}>
            {disabling && <span className="spin" />} Disable 2FA
          </button>
        </Modal>
      )}

      {showChangePw && (
        <Modal title="Change password" onClose={() => setShowChangePw(false)}>
          <div className="field mb">
            <label>Current password</label>
            <input className="input" type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} autoFocus />
          </div>
          <div className="field mb">
            <label>New password</label>
            <input className="input" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            <div className="tiny" style={{ marginTop: 4 }}>At least 8 characters, with uppercase, lowercase, and a number.</div>
          </div>
          <button className="btn btn-primary btn-block" disabled={changingPw || !pwOld || !pwNew} onClick={changePassword}>
            {changingPw && <span className="spin" />} Change password
          </button>
        </Modal>
      )}

      {buyBadgeOpen && st.wallet.address && (
        <BuyBadgeModal
          walletAddress={st.wallet.address}
          priceKes={badgeConfig?.priceKes ?? 17}
          stkConfigured={badgeConfig?.providerMode === 'live'}
          onClose={() => setBuyBadgeOpen(false)}
          onIssued={() => {
            st.user.hasBadge = true;
            store.commit();
            setBuyBadgeOpen(false);
            toast('Badge purchased!');
          }}
        />
      )}
    </div>
  );
}

type BuyBadgeStep = 'form' | 'awaiting_payment' | 'issuing' | 'done';

function BuyBadgeModal({
  walletAddress,
  priceKes,
  stkConfigured,
  onClose,
  onIssued,
}: {
  walletAddress: string;
  priceKes: number;
  stkConfigured: boolean;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<BuyBadgeStep>('form');
  const [quote, setQuote] = useState<BadgeQuote | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const finishIssue = async (quoteId: string) => {
    setStep('issuing');
    const issueRes = await badgeApi.issue({ quoteId, walletAddress });
    setBusy(false);
    if (issueRes.ok && issueRes.data) {
      setStep('done');
      onIssued();
    } else {
      toast(issueRes.error || 'Badge issuance failed', false);
      setStep('form');
    }
  };

  const pollStatus = (quoteId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await badgeApi.getStatus(quoteId);
      if (!res.ok || !res.data) return;
      setQuote(res.data);
      if (res.data.status === 'confirmed') {
        clearInterval(pollRef.current);
        finishIssue(quoteId);
      } else if (res.data.status === 'failed') {
        clearInterval(pollRef.current);
        toast(res.data.reason || 'Payment failed', false);
        setStep('form');
        setBusy(false);
      }
    }, 3000);
  };

  const submit = async () => {
    if (!/^254\d{9}$/.test(phone)) {
      toast('Enter phone as 254XXXXXXXXX', false);
      return;
    }

    setBusy(true);
    const reserveRes = await badgeApi.reserve({ walletAddress, phone });
    if (!reserveRes.ok || !reserveRes.data) {
      toast(reserveRes.error || 'Failed to reserve quote', false);
      setBusy(false);
      return;
    }

    const { quoteId } = reserveRes.data;

    if (!stkConfigured) {
      toast('Quote reserved, but M-Pesa STK push is not configured in this environment.', false);
      setBusy(false);
      return;
    }

    const mpesaRes = await badgeApi.initiateMpesa({ quoteId, phone });
    if (!mpesaRes.ok || !mpesaRes.data) {
      toast(mpesaRes.error || 'Failed to start M-Pesa payment', false);
      setBusy(false);
      return;
    }

    setStep('awaiting_payment');
    toast('Check your phone for the M-Pesa prompt');
    pollStatus(quoteId);
  };

  return (
    <Modal title="Buy Mallchain badge" onClose={onClose}>
      {step === 'form' && (
        <>
          <p className="tiny" style={{ marginBottom: 12 }}>
            KSh {priceKes} via M-Pesa — issues a gold Mallchain badge to your wallet on-chain, unlocking the monthly
            Mallpoints → Mallcoin conversion window.
          </p>
          <div className="field">
            <label>M-Pesa phone number</label>
            <input
              className="input"
              type="tel"
              placeholder="254712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy && <span className="spin" />} Pay KSh {priceKes}
          </button>
        </>
      )}

      {step === 'awaiting_payment' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40 }}>📲</div>
          <h2 style={{ margin: '8px 0' }}>Check your phone</h2>
          <div className="muted">Complete the M-Pesa prompt sent to <b>{phone}</b> for {priceKes} KES.</div>
          {quote && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>Quote {quote.quoteId}</div>}
        </div>
      )}

      {step === 'issuing' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div className="spin" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ margin: '8px 0' }}>Payment confirmed</h2>
          <div className="muted">Issuing your badge on-chain…</div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h2 style={{ margin: '8px 0' }}>Badge issued!</h2>
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
