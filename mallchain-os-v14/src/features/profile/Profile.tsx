import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { minesApi, type MinesProfile } from '../../services/minesApi';
import { settingsApi } from '../../services/settingsApi';

/** Profile — real username/phone (backend/src/routes/mines.js) + real 2FA (backend/src/routes/settings.js). */
export default function Profile() {
  useStoreVersion();
  const st = store.state;

  const [profile, setProfile] = useState<MinesProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [profileRes, settingsRes] = await Promise.all([minesApi.getProfile(), settingsApi.get()]);
    if (profileRes.ok && profileRes.data) {
      setProfile(profileRes.data);
      setUsername(profileRes.data.username || '');
      setPhone('');
    }
    if (settingsRes.ok && settingsRes.data) setTwoFactorEnabled(settingsRes.data.security.twoFactorEnabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!username.trim()) return toast('Name cannot be empty', false);
    setSaving(true);
    const res = await minesApi.updateProfile({ username: username.trim(), phone: phone.trim() || undefined });
    setSaving(false);
    if (res.ok) {
      st.user.name = username.trim();
      st.user.avatarInitial = username.trim()[0]?.toUpperCase() || 'C';
      store.commit();
      toast('Profile updated');
      load();
    } else {
      toast(res.error || 'Failed to update profile', false);
    }
  };

  const toggle2fa = async () => {
    if (twoFactorEnabled) {
      const res = await settingsApi.disable2fa();
      if (res.ok) { setTwoFactorEnabled(false); toast('2FA disabled'); }
      else toast(res.error || 'Failed to disable 2FA', false);
      return;
    }
    const code = window.prompt('Enter the 6-digit code from your authenticator app to enable 2FA:');
    if (!code) return;
    const res = await settingsApi.enable2fa(code);
    if (res.ok) { setTwoFactorEnabled(true); toast('2FA enabled'); }
    else toast(res.error || 'Failed to enable 2FA', false);
  };

  return (
    <div>
      <div className="view-head"><h1>Profile</h1><span className="sub">your public identity on Mallchain</span></div>
      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Edit profile</h2></div>
          <div className="row mb">
            <div className="avatar" style={{ width: 56, height: 56, fontSize: 24 }}>{st.user.avatarInitial}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{st.user.name}</div>
              <div className="tiny">{profile?.email}</div>
            </div>
          </div>
          <div className="field"><label>Username</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} /></div>
          <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7…" disabled={loading} /></div>
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving || loading}>{saving && <span className="spin" />} Save changes</button>
        </div>
        <div>
          <div className="card mb">
            <div className="sec-title"><h2>Account</h2></div>
            <div className="flag-row"><div className="desc"><div className="t">KYC level</div><div className="m">identity verification</div></div><span className="chip green">Level {st.user.kycLevel}</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Wallet</div><div className="m">your Mallchain address</div></div><span className="chip mono" style={{ fontSize: 11 }}>{st.wallet.address ? `${st.wallet.address.slice(0, 10)}…` : '—'}</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Status</div></div>{st.user.frozen ? <span className="frozen-badge">❄ Banned</span> : <span className="chip green">Active</span>}</div>
            <div className="flag-row"><div className="desc"><div className="t">Mallpoints balance</div></div><span className="chip">{profile?.mlpts_balance ?? '—'}</span></div>
          </div>
          <div className="card">
            <div className="sec-title"><h2>Security</h2></div>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={toggle2fa}>{twoFactorEnabled ? '✓ 2FA enabled — disable' : 'Enable 2FA'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
