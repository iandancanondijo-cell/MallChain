import { useState } from 'react';
import { toast } from '../../../components/ui';
import { settingsApi } from '../../../services/settingsApi';
import { Card } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 04 — the number that actually receives codes.
 *
 * Distinct from the display number on the Profile card, and the two used to be
 * labelled identically, which meant people verified the wrong one and then
 * wondered why SMS never arrived. Verification is a two-step handshake
 * (save the number, then deliver a code to it): saving the number is not
 * verifying it, and a gateway that refuses to send is reported as such instead
 * of as "sent" — the backend answers 503 exactly for that.
 */

const E164 = /^\+[1-9]\d{1,14}$/;

export function ContactCard({ data }: { data: SettingsData }) {
  const contact = data.contact;
  const [number, setNumber] = useState(contact?.phoneNumber || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // A verified number is read-only until the person says they want another one,
  // because saving over a verified number without a new code would silently
  // redirect every SMS the account depends on.
  const [editing, setEditing] = useState(false);

  const syncedKey = contact?.phoneNumber + '|' + String(contact?.phoneVerified);
  const [synced, setSynced] = useState<string | null>(null);
  if (syncedKey !== synced) {
    setSynced(syncedKey);
    setNumber(contact?.phoneNumber || '');
  }

  const verified = contact?.phoneVerified ?? false;
  const locked = verified && !editing;

  // Every contact write is answered with a fragment (updateContact gives the
  // record, verifyPhone only {verified, phoneNumber}, the opt-ins only a flag),
  // so the card re-reads the one document instead of stitching three partial
  // answers together and guessing at the rest.
  const refresh = async () => {
    const res = await settingsApi.getContact();
    if (res.ok && res.data) data.setContact(res.data);
    return res;
  };

  const sendCode = async () => {
    setBusy(true);
    const saved = await settingsApi.updateContact({ phoneNumber: number });
    if (!saved.ok) {
      setBusy(false);
      toast(saved.error || 'The number was not saved, so no code was sent.', false);
      return;
    }
    await refresh();

    const otp = await settingsApi.sendPhoneOtp();
    setBusy(false);
    if (otp.ok) {
      setCodeSent(true);
      setCode('');
      toast(`A 6-digit code is on its way to ${saved.data?.phoneNumber || number}`);
      return;
    }
    setCodeSent(false);
    toast(otp.error || 'Number saved, but no code could be sent. Try again shortly.', false);
  };

  const confirmCode = async () => {
    setBusy(true);
    const res = await settingsApi.verifyPhone(code);
    if (!res.ok) {
      setBusy(false);
      toast(res.error || 'That code is not correct', false);
      return;
    }
    const fresh = await refresh();
    setBusy(false);
    setCodeSent(false);
    setCode('');
    setEditing(false);
    toast(fresh.ok && fresh.data?.phoneVerified ? 'Phone verified' : 'The code was accepted, but the record still says unverified — try again.');
  };

  const setWhatsapp = async (on: boolean) => {
    setBusy(true);
    const res = on ? await settingsApi.optInWhatsApp() : await settingsApi.optOutWhatsApp();
    if (!res.ok) {
      setBusy(false);
      toast(res.error || 'Failed to update WhatsApp settings', false);
      return;
    }
    const fresh = await refresh();
    setBusy(false);
    const stored = fresh.ok ? fresh.data?.whatsappOptIn : on;
    toast(stored === on
      ? (on ? 'WhatsApp alerts enabled' : 'WhatsApp alerts turned off')
      : `WhatsApp is ${stored ? 'on' : 'off'} on your account.`);
  };

  return (
    <Card
      title="Contact number"
      hint="This is the number SMS and WhatsApp alerts are delivered to. The display number on the Profile card is separate and receives nothing."
      state={
        contact ? (
          <span className="chip" style={{ marginLeft: 'auto', color: verified ? 'var(--green)' : 'var(--warning)', borderColor: verified ? 'var(--green)' : 'var(--warning)' }}>
            {verified ? '✓ Verified' : 'Not verified'}
          </span>
        ) : undefined
      }
      missing={data.has('contact') ? undefined : 'the verified contact record'}
      onRetry={data.reload}
      busy={data.loading}
    >
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="tel"
          placeholder="+254712345678"
          aria-label="Contact number for codes"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          style={{ maxWidth: 240 }}
          disabled={locked || busy}
        />
        {locked ? (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => { setEditing(true); setNumber(''); }}
          >
            Change number
          </button>
        ) : (
          <button className="btn btn-ghost" disabled={busy || !E164.test(number)} onClick={sendCode}>
            {busy ? 'Working…' : verified ? 'Send a code to the new number' : 'Send me a code'}
          </button>
        )}
      </div>
      {verified && !editing && (
        <div className="ps-note">Verified {contact?.phoneVerifiedAt ? new Date(contact.phoneVerifiedAt).toLocaleDateString() : '—'}. Changing it means a new code — an unverified number receives nothing.</div>
      )}
      {!verified && number && !E164.test(number) && (
        <div className="ps-note" data-tone="warn">Use the international format with no spaces, e.g. +254712345678.</div>
      )}

      {codeSent && (
        <div style={{ marginTop: 14 }}>
          <div className="ps-sub" style={{ marginTop: 0 }}>Enter the code</div>
          <div className="ps-note" style={{ marginTop: 0 }}>It expires in 10 minutes. Five wrong guesses end it.</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input
              className="input"
              type="text"
              placeholder="6-digit code"
              aria-label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              style={{ maxWidth: 160 }}
            />
            <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={confirmCode}>Confirm</button>
          </div>
        </div>
      )}

      <div className="ps-sub">WhatsApp</div>
      {verified ? (
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <label className="switch">
            <input
              type="checkbox"
              aria-label="Enable WhatsApp notifications"
              checked={contact?.whatsappOptIn ?? false}
              disabled={busy}
              onChange={(e) => void setWhatsapp(e.target.checked)}
            />
            <span className="track" /><span className="knob" />
          </label>
          <span className="ps-note" style={{ marginTop: 0 }}>
            {contact?.whatsappOptIn ? 'Connected — wallet alerts arrive on WhatsApp.' : 'Off — turn on to receive wallet alerts on WhatsApp.'}
          </span>
        </div>
      ) : (
        <p className="ps-note" style={{ marginTop: 0 }}>Verify the number above first — WhatsApp is delivered to the verified number only.</p>
      )}
    </Card>
  );
}
