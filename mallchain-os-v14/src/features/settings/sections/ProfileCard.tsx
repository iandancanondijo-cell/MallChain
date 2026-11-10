import { useState } from 'react';
import { store } from '../../../store/store';
import { toast } from '../../../components/ui';
import { minesApi } from '../../../services/minesApi';
import { api } from '../../../services/api';
import { AvatarPicker } from '../AvatarUpload';
import { Card, InfoRow } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 01 — who you are on Mallchain.
 *
 * Four things used to live in three places here: the picture, the display name
 * your KYC submission produced, the handle you chose, and two different phone
 * numbers that both said "Phone". They are one card now, and the two numbers
 * have different words in front of them, because only one of them receives
 * codes (see ContactCard).
 */

const E164 = /^\+[1-9]\d{1,14}$/;

export function ProfileCard({ data }: { data: SettingsData }) {
  const st = store.state;
  const profile = data.profile;

  const [username, setUsername] = useState(profile?.username || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [syncedFrom, setSyncedFrom] = useState<string | null>(null);

  // The read replaces the draft only when the draft is still the old value, so
  // a reload landing mid-typing cannot swallow what is being typed.
  const key = profile?.username + '|' + profile?.phone;
  if (key !== syncedFrom) {
    setSyncedFrom(key);
    setUsername(profile?.username || '');
    setPhone(profile?.phone || '');
  }

  const dirty = profile !== null
    && (username !== (profile.username || '') || phone !== (profile.phone || ''));
  const phoneEdited = profile !== null && phone.trim() !== (profile.phone || '').trim();

  const save = async () => {
    if (!dirty) return;
    if (!username.trim()) {
      toast('Username cannot be empty', false);
      return;
    }
    // Only a number that was just edited is checked. Legacy rows hold values
    // like "0712…", and refusing those would block saving a handle the person
    // did change.
    if (phoneEdited && phone.trim() && !E164.test(phone.trim())) {
      toast('Phone needs the international format, e.g. +254712345678', false);
      return;
    }
    setSaving(true);
    const res = await minesApi.updateProfile({ username: username.trim(), phone: phone.trim() || undefined });
    if (!res.ok) {
      setSaving(false);
      toast(res.error || 'Failed to update profile', false);
      return;
    }
    // `name` is KYC-derived and must not be guessed from the handle just typed,
    // or it visibly reverts on the next reload. Re-resolve it the way App.tsx's
    // session sync does, from the server record.
    const me = await api.get<{ user?: { name?: string | null; username?: string | null; email?: string; avatarUrl?: string | null } }>('/api/auth/me');
    if (me.ok && me.data?.user) {
      const u = me.data.user;
      const realName = u.name || u.username || u.email?.split('@')[0];
      if (realName) {
        st.user.name = realName;
        st.user.avatarInitial = realName[0]?.toUpperCase() || st.user.avatarInitial;
      }
      // The handle may also have landed server-side in a form different from
      // what was typed, so the stored picture — and nothing invented — is what
      // the account record says.
      if (typeof u.avatarUrl === 'string' || u.avatarUrl === null) st.user.avatarUrl = u.avatarUrl || null;
      store.commit();
    }
    toast('Profile updated');
    await data.reload();
    setSaving(false);
  };

  return (
    <Card
      title="Profile"
      hint="What other people see. Your picture is stored on your account, so it appears in the menu bar and on anything that lists you."
      state={dirty
        ? <span className="chip" style={{ color: 'var(--warning)', borderColor: 'var(--warning)', marginLeft: 'auto' }}>Unsaved</span>
        : undefined}
    >
      <AvatarPicker
        storedUrl={st.user.avatarUrl}
        name={st.user.name || profile?.username || 'You'}
        initial={st.user.avatarInitial}
        hasBadge={st.user.hasBadge}
        email={profile?.email || st.user.email}
        onStored={(stored) => {
          st.user.avatarUrl = stored;
          store.commit();
        }}
      />

      <div className="ps-pair">
        <div className="field">
          <label htmlFor="ps-username">Username</label>
          <input
            id="ps-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={data.loading || profile === null}
          />
          <div className="ps-note">A handle for the app. Separate from the display name above, which comes from your identity documents.</div>
        </div>

        <div className="field">
          <label htmlFor="ps-phone">Display phone number</label>
          <input
            id="ps-phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+254712345678"
            disabled={data.loading || profile === null}
          />
          <div className="ps-note">Shown on your profile only. It does not receive codes — the verified number under “Contact number” is the one that does.</div>
        </div>
      </div>

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 14 }}
        onClick={save}
        disabled={saving || data.loading || !dirty}
      >
        {saving && <span className="spin" />} Save changes
      </button>
      <div className="ps-note" data-tone={dirty ? 'warn' : undefined}>
        {dirty
          ? 'Unsaved changes — Save writes them to your account.'
          : profile === null
            ? 'Your profile could not be read, so there is nothing here to edit safely.'
            : 'Nothing to save — both fields match what is on your account.'}
      </div>

      <div className="ps-sub">On your account</div>
      <InfoRow label="Display name" note="from your verified identity" value={st.user.name || '—'} tone={st.user.name ? 'default' : 'muted'} />
      <InfoRow label="Email" note="sign-in address" value={profile?.email || st.user.email || '—'} tone={profile?.email ? 'default' : 'muted'} />
      <InfoRow
        label="Mallpoints"
        note="earned on Mining tasks, spendable inside the app"
        value={profile ? `${profile.mlpts_balance ?? 0} MLPTS` : '—'}
      />
      <InfoRow label="Account status" value={st.user.frozen ? '❄ Frozen' : 'Active'} tone={st.user.frozen ? 'bad' : 'ok'} />
    </Card>
  );
}
