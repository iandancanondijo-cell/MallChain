import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Profile — edit display name, avatar initial, bio — persisted;
 *  sidebar + topbar reflect changes. */
export default function Profile() {
  useStoreVersion();
  const st = store.state;
  const [name, setName] = useState(st.user.name);
  const [initial, setInitial] = useState(st.user.avatarInitial);
  const [bio, setBio] = useState(st.user.bio);

  const save = () => {
    if (!name.trim()) { toast('Name cannot be empty', false); return; }
    st.user.name = name.trim();
    st.user.avatarInitial = (initial.trim() || name.trim()[0] || 'C').toUpperCase();
    st.user.bio = bio.trim();
    store.commit();
    toast('Profile updated — sidebar & topbar refreshed');
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
              <div className="tiny">{st.user.email} · {st.user.phone}</div>
            </div>
          </div>
          <div className="field"><label>Display name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Avatar initial</label><input className="input" maxLength={2} value={initial} onChange={(e) => setInitial(e.target.value)} /></div>
          <div className="field"><label>Bio</label><textarea className="input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell the community about yourself…" /></div>
          <button className="btn btn-primary btn-block" onClick={save}>Save changes</button>
        </div>
        <div>
          <div className="card mb">
            <div className="sec-title"><h2>Account</h2></div>
            <div className="flag-row"><div className="desc"><div className="t">KYC level</div><div className="m">identity verification</div></div><span className="chip green">Level {st.user.kycLevel}</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Wallet</div><div className="m">your Mallchain address</div></div><span className="chip mono" style={{ fontSize: 11 }}>{st.wallet.address.slice(0, 10)}…</span></div>
            <div className="flag-row"><div className="desc"><div className="t">Status</div></div>{st.user.frozen ? <span className="frozen-badge">❄ Frozen</span> : <span className="chip green">Active</span>}</div>
          </div>
          <div className="card">
            <div className="sec-title"><h2>Security</h2></div>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => toast('2FA setup — check your email')}>Enable 2FA</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toast('Recovery phrase re-exported')}>Export recovery</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toast('PIN changed')}>Change PIN</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
