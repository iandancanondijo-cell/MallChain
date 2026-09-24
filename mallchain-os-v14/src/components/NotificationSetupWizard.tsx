/**
 * NotificationSetupWizard — guided step-by-step flow inside the notification
 * panel. Helps users connect a delivery channel (WhatsApp, Email, or SMS)
 * so they receive real-time alerts outside the app.
 *
 * Steps:
 *   1. Welcome prompt
 *   2. Platform selection
 *   3. Contact details entry
 *   4. OTP verification (phone channels) / confirmation (email)
 *   5. Success
 *
 * Uses the existing settingsApi contact methods — no new backend endpoints.
 */
import { useState } from 'react';
import { MessageCircle, Mail, Phone, ArrowLeft, Check, X, Zap, ChevronRight } from 'lucide-react';
import { settingsApi, type ContactInfo } from '../services/settingsApi';
import { toast } from './ui';

type Platform = 'whatsapp' | 'email' | 'sms';
type Step = 'welcome' | 'platform' | 'details' | 'verify' | 'success';

interface Props {
  /** Current contact info — used to skip steps the user has already completed. */
  contact: ContactInfo | null;
  /** User's email from the store, shown during email confirmation. */
  userEmail?: string;
  /** Called when the wizard finishes successfully. */
  onComplete: () => void;
  /** Called when the user dismisses the wizard. */
  onDismiss: () => void;
}

export default function NotificationSetupWizard({ contact, userEmail, onComplete, onDismiss }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [platform, setPlatform] = useState<Platform>('whatsapp');
  const [phoneInput, setPhoneInput] = useState(contact?.phoneNumber || '');
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | undefined>();

  const goBack = () => {
    if (step === 'platform') setStep('welcome');
    else if (step === 'details') setStep('platform');
    else if (step === 'verify') setStep('details');
  };

  const selectPlatform = (p: Platform) => {
    setPlatform(p);
    setStep('details');
  };

  const submitDetails = async () => {
    setLoading(true);
    try {
      if (platform === 'email') {
        // Email is already on file — just confirm and move to success.
        setStep('success');
        return;
      }

      // Phone-based channels: save number, send OTP.
      const r = await settingsApi.updateContact({ phoneNumber: phoneInput });
      if (!r.ok) {
        toast(r.error || 'Could not save phone number');
        setLoading(false);
        return;
      }

      const otpRes = await settingsApi.sendPhoneOtp();
      if (!otpRes.ok) {
        toast(otpRes.error || 'Could not send verification code');
        setLoading(false);
        return;
      }

      if (otpRes.data?.otp) setDevOtp(otpRes.data.otp);
      setStep('verify');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setLoading(true);
    try {
      const r = await settingsApi.verifyPhone(otpInput);
      if (!r.ok) {
        toast(r.error || 'Invalid verification code');
        setLoading(false);
        return;
      }

      // If the user chose WhatsApp, also opt them in.
      if (platform === 'whatsapp') {
        await settingsApi.optInWhatsApp();
      }

      setStep('success');
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    toast('Real-time notifications enabled');
    onComplete();
  };

  // ── Step renderers ──────────────────────────────────────────────────

  const renderWelcome = () => (
    <div style={{ padding: '20px 16px', textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, margin: '0 auto 14px',
        background: 'linear-gradient(135deg, rgba(243,186,47,0.15), rgba(243,186,47,0.05))',
        border: '1px solid rgba(243,186,47,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Zap size={22} style={{ color: 'var(--accent, #f3ba2f)' }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--txt-1)' }}>
        Receive real-time notifications
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 18, maxWidth: 260, margin: '0 auto 18px' }}>
        Get transaction alerts, security updates, and important messages delivered directly to your favorite apps.
      </div>
      <button
        className="btn btn-primary btn-block"
        style={{ fontSize: 13, padding: '10px 20px', borderRadius: 10 }}
        onClick={() => setStep('platform')}
      >
        Set up notifications
        <ChevronRight size={14} style={{ marginLeft: 6, verticalAlign: -2 }} />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'var(--txt-3)', fontSize: 11.5, marginTop: 10, cursor: 'pointer' }}
      >
        Maybe later
      </button>
    </div>
  );

  const renderPlatform = () => {
    const platforms: { id: Platform; icon: typeof MessageCircle; label: string; desc: string; color: string }[] = [
      { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', desc: 'Instant alerts on WhatsApp', color: '#25D366' },
      { id: 'sms', icon: Phone, label: 'SMS', desc: 'Text message alerts', color: '#3b82f6' },
      { id: 'email', icon: Mail, label: 'Email', desc: 'Notifications to your inbox', color: '#a78bfa' },
    ];

    return (
      <div style={{ padding: '14px 14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--txt-1)' }}>
          Choose your platform
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginBottom: 12 }}>
          Where would you like to receive notifications?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {platforms.map((p) => {
            const Icon = p.icon;
            const alreadyVerified = p.id === 'email'
              ? contact?.emailVerified
              : contact?.phoneVerified;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlatform(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'var(--bg-3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flex: 'none',
                  background: `${p.color}18`, border: `1px solid ${p.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} style={{ color: p.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)' }}>
                    {p.label}
                    {alreadyVerified && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green-2, #22c55e)', fontWeight: 600 }}>Connected</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 1 }}>{p.desc}</div>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--txt-3)', flex: 'none' }} />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDetails = () => {
    const isPhone = platform === 'whatsapp' || platform === 'sms';
    const platformLabel = platform === 'whatsapp' ? 'WhatsApp' : platform === 'sms' ? 'SMS' : 'Email';

    return (
      <div style={{ padding: '14px 14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--txt-1)' }}>
          {isPhone ? 'Enter your phone number' : 'Confirm your email'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginBottom: 14, lineHeight: 1.5 }}>
          {isPhone
            ? `We'll send a verification code to this number for ${platformLabel} alerts.`
            : `Notifications will be sent to your account email.`
          }
        </div>

        {isPhone ? (
          <div>
            <input
              className="input"
              type="tel"
              placeholder="+254712345678"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '10px 12px', marginBottom: 4 }}
              autoFocus
            />
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)', marginTop: 4 }}>
              Include country code (e.g. +254 for Kenya)
            </div>
          </div>
        ) : (
          <div style={{
            padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 10,
            border: '1px solid var(--line-1)', fontSize: 13, color: 'var(--txt-1)',
          }}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-3)', marginBottom: 4 }}>Email address</div>
            {userEmail || 'Not available'}
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 14, fontSize: 13, padding: '10px 20px', borderRadius: 10 }}
          disabled={loading || (isPhone && !/^\+[1-9]\d{1,14}$/.test(phoneInput))}
          onClick={submitDetails}
        >
          {loading ? (
            <span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          ) : (
            <>Send verification code</>
          )}
        </button>
      </div>
    );
  };

  const renderVerify = () => (
    <div style={{ padding: '14px 14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--txt-1)' }}>
        Enter verification code
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginBottom: 14, lineHeight: 1.5 }}>
        We sent a 6-digit code to <strong style={{ color: 'var(--txt-2)' }}>{phoneInput}</strong>
      </div>

      {devOtp && (
        <div style={{
          padding: '8px 12px', background: 'rgba(243,186,47,0.08)', borderRadius: 8,
          border: '1px solid rgba(243,186,47,0.2)', fontSize: 11.5, color: 'var(--gold)',
          marginBottom: 12,
        }}>
          Dev mode — your code: <strong>{devOtp}</strong>
        </div>
      )}

      <input
        className="input"
        type="text"
        placeholder="6-digit code"
        value={otpInput}
        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
        maxLength={6}
        style={{ width: '100%', fontSize: 16, padding: '12px 14px', textAlign: 'center', letterSpacing: 6, fontWeight: 700, fontFamily: 'var(--mono, monospace)' }}
        autoFocus
      />

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 14, fontSize: 13, padding: '10px 20px', borderRadius: 10 }}
        disabled={loading || otpInput.length !== 6}
        onClick={submitOtp}
      >
        {loading ? (
          <span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        ) : (
          'Verify'
        )}
      </button>

      <button
        type="button"
        onClick={async () => {
          setLoading(true);
          const r = await settingsApi.sendPhoneOtp();
          if (r.ok && r.data?.otp) setDevOtp(r.data.otp);
          toast(r.ok ? 'Code resent' : (r.error || 'Could not resend code'));
          setLoading(false);
        }}
        style={{ background: 'none', border: 'none', color: 'var(--accent, #f3ba2f)', fontSize: 12, marginTop: 10, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}
      >
        Resend code
      </button>
    </div>
  );

  const renderSuccess = () => {
    const platformLabel = platform === 'whatsapp' ? 'WhatsApp' : platform === 'sms' ? 'SMS' : 'Email';

    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={24} style={{ color: 'var(--green-2, #22c55e)' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--txt-1)' }}>
          You're all set!
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 18, maxWidth: 260, margin: '0 auto 18px' }}>
          {platformLabel} notifications are now active. You'll receive real-time alerts for transactions, security events, and more.
        </div>
        <button
          className="btn btn-primary btn-block"
          style={{ fontSize: 13, padding: '10px 20px', borderRadius: 10 }}
          onClick={finish}
        >
          Done
        </button>
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────

  const showBack = step !== 'welcome' && step !== 'success';

  return (
    <div style={{
      borderBottom: '1px solid var(--line-1)',
      background: 'var(--bg-1)',
    }}>
      {/* Mini header with back / close */}
      {(showBack || step === 'success') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderBottom: '1px solid var(--line-1)',
        }}>
          {showBack && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-2)', display: 'flex', padding: 2 }}
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--txt-2)' }}>
            {step === 'platform' && 'Choose platform'}
            {step === 'details' && 'Contact details'}
            {step === 'verify' && 'Verification'}
            {step === 'success' && 'Complete'}
          </span>
          {step !== 'success' && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close setup"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', display: 'flex', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Step progress dots */}
      {step !== 'welcome' && step !== 'success' && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0 0' }}>
          {(['platform', 'details', 'verify'] as const).map((s, i) => {
            const stepOrder = ['platform', 'details', 'verify'];
            const currentIdx = stepOrder.indexOf(step as typeof stepOrder[number]);
            const isActive = i <= currentIdx;
            return (
              <div
                key={s}
                style={{
                  width: isActive ? 18 : 6, height: 6, borderRadius: 3,
                  background: isActive ? 'var(--accent, #f3ba2f)' : 'var(--bg-3)',
                  transition: 'width 0.25s ease, background 0.25s ease',
                }}
              />
            );
          })}
        </div>
      )}

      {step === 'welcome' && renderWelcome()}
      {step === 'platform' && renderPlatform()}
      {step === 'details' && renderDetails()}
      {step === 'verify' && renderVerify()}
      {step === 'success' && renderSuccess()}
    </div>
  );
}
