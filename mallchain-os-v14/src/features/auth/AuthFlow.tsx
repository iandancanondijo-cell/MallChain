import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { api } from '../../services/api';
import { kycApi } from '../../services/kycApi';
import { authService } from '../../services/auth';
import { handleApiError } from '../../services/errorHandler';
import { socketManager } from '../../services/socket';
import { generateNewMnemonic, deriveAddressFromMnemonic } from '../../services/wallet';
import { config, chain } from '../../services/config';
import { useWizard } from '../../hooks/useWizard';
import WalletFlow from '../wallet/WalletFlow';
import { KycWizard, type KycData } from './KycWizard';
import BlockchainLogo from './BlockchainLogo';
import './AuthFlow.css';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertTriangle, Sparkles, Shield, Zap, Globe, AlertCircle } from 'lucide-react';

/**
 * KYC wizard steps. 'inactive' means the flow hasn't started — kept as
 * steps[0] so `kyc.stepIndex` lines up: 1=Create, 2=Verify .. 7=Review.
 * The wizard IS the signup flow — account creation and email verification
 * are steps 1 and 2, replacing the old separate signup form.
 */
const KYC_STEPS = ['inactive', 'create', 'verify', 'personal', 'address', 'identity', 'selfie', 'review'] as const;
type KycStep = typeof KYC_STEPS[number];

/**
 * Shape of authController.js's toPublicUser(), returned by
 * /api/auth/{register,login,me}. The JWT itself is never in this body — it's
 * set as an httpOnly cookie by the same response; `expiresAt` is just a
 * non-secret hint the frontend uses to know roughly how long the session is
 * expected to last (authService.setSession()).
 */
interface AuthResponse {
  expiresAt: number;
  requires2fa?: boolean;
  user?: { id: string; email: string; role: 'user' | 'admin' | 'superadmin'; banned: boolean; kycLevel: number; name?: string | null; username?: string | null };
}

const INITIAL_KYC_DATA: KycData = {
  email: '',
  password: '',
  confirmPassword: '',
  referralCode: '',
  otp: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  nationality: '',
  address: '',
  city: '',
  country: '',
  postalCode: '',
  phoneNumber: '',
  idType: '',
  idNumber: '',
  idExpiry: '',
  idDocumentUrl: '',
  selfieUrl: '',
  occupation: '',
  sourceOfFunds: '',
  annualIncome: '',
  politicalExposure: false,
  acceptTerms: false,
  confirmAge: false,
};

/** Auth flow — sign in / sign up → wallet create/import → security → dashboard. */
export default function AuthFlow({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  // If user is authenticated and has wallet connected, go to dashboard
  // If user is authenticated but no wallet, go to wallet connection
  // If user is not authenticated, go to login/signup
  const [step, setStep] = useState<number>(() => {
    if (st.user.authed && st.wallet.address) return 3; // Already has wallet - go to dashboard
    if (st.user.authed && !st.wallet.address) return 4; // Authenticated but no wallet - wallet connection
    return 0; // Not authenticated - login/signup
  });
  const [showWalletFlow, setShowWalletFlow] = useState(false);
  // Landing's "Get Started"/"Create Your Account" CTAs link here with
  // ?mode=signup so first-time users land on the signup tab instead of
  // defaulting to sign-in and having to notice/click "Create account".
  const [mode, setMode] = useState<'login' | 'signup'>(() => {
    const match = /[?&]mode=([^&]+)/.exec(window.location.hash);
    return match && match[1] === 'signup' ? 'signup' : 'login';
  });
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [referralCode] = useState(() => {
    const match = /[?&]ref=([^&]+)/.exec(window.location.hash);
    return match ? decodeURIComponent(match[1]) : '';
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  // Set once the backend reports this account has real 2FA enabled — see
  // authController.js's checkTwoFactor(). Shows a code input and blocks
  // submission until a valid TOTP/backup code is provided.
  const [requires2fa, setRequires2fa] = useState(false);
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  
  // KYC/AML state — persisted via the session tier (PII, cleared on tab close,
  // never synced cross-tab), resumable across a same-tab reload.
  const kyc = useWizard<KycStep, KycData>({
    key: 'kyc',
    tier: 'session',
    steps: KYC_STEPS,
    initialData: { ...INITIAL_KYC_DATA, referralCode },
    initialStep: mode === 'signup' ? 'create' : 'inactive',
  });
  const kycStep = kyc.stepIndex; // 0=inactive .. 7=review
  const kycData = kyc.data;

  // Load saved KYC draft from backend on mount — lets a user resume their
  // registration after closing the browser. Only runs once the user is
  // authenticated (st.user.authed) and the KYC flow hasn't already started
  // (kyc.stepIndex === 0, i.e. 'inactive'). The draft is merged into the
  // local wizard state so the user picks up exactly where they left off.
  useEffect(() => {
    if (!st.user.authed || kyc.stepIndex !== 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ ok: boolean; step: KycStep | null; data: Partial<KycData> | null; updatedAt: string | null }>('/api/kyc/draft');
        if (cancelled) return;
        if (res.ok && res.data?.step && res.data?.data) {
          // Map backend step names to wizard step names (they match 1:1).
          const step = res.data.step as KycStep;
          if (KYC_STEPS.includes(step)) {
            // Merge draft data into the wizard — only fields that are
            // actually present, so we don't overwrite anything the user
            // may have already typed in this session.
            kyc.setData(res.data.data as Partial<KycData>);
            kyc.goTo(step);
          }
        }
      } catch (err) {
        // Draft load failure is non-fatal — the user just starts fresh.
        console.warn('Failed to load KYC draft:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [st.user.authed]);

  // Auto-save draft progress to backend as the user moves through steps.
  // Debounced by 500ms so rapid typing doesn't spam the API, and only
  // fires for real KYC steps (not 'inactive' or 'review').
  useEffect(() => {
    if (!st.user.authed || kyc.stepIndex === 0 || kyc.stepIndex >= KYC_STEPS.length - 1) return;
    const step = kyc.step as KycStep;
    const timer = setTimeout(() => {
      api.patch('/api/kyc/draft', { step, data: kycData }).catch((err) => {
        console.warn('Failed to save KYC draft:', err);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [kycData, kyc.step, st.user.authed]);

  // Keep the auth screen in sync when the hash router changes only the query
  // string, such as switching from /auth?mode=login to /auth?mode=signup.
  useEffect(() => {
    const syncModeFromHash = () => {
      const match = /[?&]mode=([^&]+)/.exec(window.location.hash);
      const nextMode = match?.[1] === 'signup' ? 'signup' : 'login';
      setMode(nextMode);

      if (nextMode === 'signup' && kyc.stepIndex === 0) {
        kyc.goTo('create');
      } else if (nextMode === 'login' && kyc.stepIndex > 0) {
        kyc.reset();
      }
    };

    window.addEventListener('hashchange', syncModeFromHash);
    return () => window.removeEventListener('hashchange', syncModeFromHash);
  }, [kyc.stepIndex]);

  // Required fields per step, matching backend/src/routes/kyc.js's Joi schema
  // exactly (every field there is .required()). Previously Next/Submit had no
  // client-side gating at all, so a user could click straight through empty
  // fields and hit a 400 "validation_failed" from the backend — silently,
  // before the error-banner fix, and still avoidably even after it.
  const KYC_REQUIRED_FIELDS: Record<number, (keyof KycData)[]> = {
    1: ['email', 'password', 'confirmPassword', 'acceptTerms'],
    2: ['otp'],
    3: ['firstName', 'lastName', 'dateOfBirth', 'nationality'],
    4: ['address', 'city', 'country', 'postalCode', 'phoneNumber'],
    5: ['idType', 'idNumber', 'idExpiry'],
  };
  const isKycStepValid = (step: number): boolean => {
    const fields = KYC_REQUIRED_FIELDS[step];
    if (!fields) return true;
    return fields.every((f) => String(kycData[f] ?? '').trim().length > 0);
  };
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docFileName, setDocFileName] = useState('');
  const [docError, setDocError] = useState('');

  const handleDocumentSelect = async (file: File | undefined) => {
    if (!file) return;
    setDocError('');
    setDocUploading(true);
    const res = await kycApi.uploadDocument(file);
    setDocUploading(false);
    if (res.ok && res.data) {
      kyc.setData({ idDocumentUrl: res.data.documentRef });
      setDocFileName(file.name);
    } else {
      setDocError(res.error || 'Failed to upload document');
    }
  };

  const [amlRiskLevel, setAmlRiskLevel] = useState<'low' | 'medium' | 'high' | null>(null);
  // Populated by the (removed) AML-check step; always unchecked today since
  // submitKYC's response — not a separate AML call — is what sets amlRiskLevel.
  const [amlChecks] = useState({
    sanctions: false,
    pep: false,
    adverseMedia: false,
    watchlist: false
  });

  // Generate the mnemonic entirely client-side — it never transits the
  // network this way, unlike the old POST /api/wallet/generate-mnemonic.
  useEffect(() => {
    if (step === 1 && !mnemonic) {
      try {
        setMnemonic(generateNewMnemonic(24));
      } catch (err) {
        console.error('Failed to generate mnemonic:', err);
      }
    }
  }, [step, mnemonic]);

  const createWallet = async (mnemonicToUse?: string) => {
    setBusy(true);
    try {
      const mnemonicPhrase = mnemonicToUse || mnemonic;
      
      if (!mnemonicPhrase || mnemonicPhrase.split(' ').length !== 24) {
        setErr('Invalid mnemonic phrase - must be 24 words');
        setBusy(false);
        return;
      }

      // Derive the wallet address entirely client-side — the mnemonic never
      // leaves the browser this way, unlike the old POST /api/wallet/create.
      const info = await deriveAddressFromMnemonic(mnemonicPhrase);
      setWalletAddress(info.address);
      st.wallet.address = info.address;
      st.wallet.accountId = info.address;
      st.wallet.chainId = chain.chainId;
      st.wallet.createdAt = Date.now();
      store.commit();
      toast(`Wallet created — ${info.address.slice(0, 8)}...${info.address.slice(-6)}`);
      setBusy(false);
      setStep(2); // Go to security setup
    } catch (err) {
      setErr('Failed to create wallet');
      handleApiError({ ok: false, error: 'Wallet creation failed', code: 500 } as any,
        { action: 'creating wallet', endpoint: 'client-side derivation' },
        false
      );
      setBusy(false);
    }
  };

  const importWallet = async () => {
    if (!importMnemonic.trim()) {
      setErr('Please enter your mnemonic phrase');
      return;
    }
    await createWallet(importMnemonic.trim());
  };

  const recoverWallet = async () => {
    setErr('');
    const words = recoveryMnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setErr('Recovery phrase must be 12 or 24 words');
      return;
    }
    if (recoveryPassword.length < 8) {
      setErr('New password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await createWallet(recoveryMnemonic.trim());
      toast('Wallet recovered from mnemonic. Set a new password going forward.');
      setRecoveryMode(false);
      setRecoveryMnemonic('');
      setRecoveryPassword('');
    } catch {
      setErr('Recovery failed — check your mnemonic phrase');
    } finally {
      setBusy(false);
    }
  };

  const submitKYC = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await api.post<{ success: boolean; kycId: string; riskLevel: 'low' | 'medium' | 'high'; status: 'pending' }>('/api/kyc/submit', kycData);

      if (res.ok && res.data?.success) {
        setAmlRiskLevel(res.data.riskLevel);
        // Every submission now requires a real admin decision — kycLevel
        // stays at 1 (unverified) until an admin approves it, regardless of
        // the automated risk signal.
        toast('KYC submitted — under review. You can now access the dashboard with limited features.');
        // Clear the saved draft — the user has completed the flow, so a
        // stale "resume" prompt on next login would be confusing.
        api.delete('/api/kyc/draft').catch(() => {});
        setBusy(false);
        // Reset the KYC wizard so the user doesn't get stuck in the flow
        // when navigating to the dashboard — kycStep goes back to 0 ('inactive'),
        // letting the dashboard render normally with the pending-KYC banner.
        kyc.reset();
        // Navigate to dashboard instead of keeping user in KYC flow — they
        // can explore with limited functionality while KYC is pending.
        navigate('/');
      } else {
        console.error('KYC submission error:', res);
        setErr(res.error || 'KYC submission failed');
        setBusy(false);
      }
    } catch (err) {
      console.error('KYC submission exception:', err);
      setErr('Failed to submit KYC');
      handleApiError({ ok: false, error: 'KYC submission failed', code: 500 } as any, 
        { action: 'submitting KYC', endpoint: '/api/kyc/submit' }, 
        false
      );
      setBusy(false);
    }
  };

  const submitAuth = async () => {
    setErr('');
    setFieldErrors({});

    if (!email.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (pass.length < 8) { setErr('Password must be at least 8 characters.'); return; }

    setBusy(true);

    const res = await api.post<AuthResponse>('/api/auth/login', { email, password: pass, otp: otp || undefined });

    if (res.ok && res.data?.requires2fa) {
      setRequires2fa(true);
      setBusy(false);
      return;
    }

    if (res.ok && res.data) {
      authService.setSession(res.data.expiresAt);

      const u = res.data.user;
      if (store.state.user.id !== (u?.id || '')) {
        store.reset();
      }
      store.state.user = {
        ...store.state.user,
        id: u?.id || '',
        authed: true,
        name: u?.name || u?.username || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email,
        avatarInitial: email[0].toUpperCase(),
        frozen: !!u?.banned,
        kycLevel: u?.kycLevel ?? 1,
        role: u?.role || 'user',
      };
      store.commit();
      socketManager.reauth();
      if (u?.id) socketManager.subscribeUser(u.id);
      toast('Welcome back to Mallchain!');
      setBusy(false);
      const role = u?.role || 'user';
      navigate(role === 'admin' || role === 'superadmin' ? '/admin' : '/');
    } else {
      const errorMsg = res.error || 'Login failed';
      setErr(errorMsg);
      handleApiError({ ok: res.ok, error: res.error, code: res.code } as any,
        { action: 'signing in', endpoint: '/api/auth/login' },
        false
      );
      setBusy(false);
    }
  };


  if (kycStep > 0) {
    return (
      <KycWizard
        stepIndex={kycStep}
        data={kycData}
        setData={(data) => kyc.setData(data)}
        error={err}
        onNext={async () => {
          setErr('');
          if (kyc.stepIndex === 1) {
            // Step 1: Create account — validate and register
            const { email: em, password: pw, confirmPassword: cpw, acceptTerms: terms, confirmAge: ageOk } = kycData;
            if (!em || !em.includes('@')) { setErr('Enter a valid email address.'); return; }
            if (!pw || pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
            if (pw !== cpw) { setErr('Passwords do not match.'); return; }
            if (!ageOk) { setErr('You must confirm you are at least 18 years old.'); return; }
            if (!terms) { setErr('You must agree to the Terms of Service.'); return; }
            setBusy(true);
            const res = await api.post<AuthResponse>('/api/auth/register', {
              email: em,
              password: pw,
              referralCode: kycData.referralCode.trim() || undefined,
            });
            if (res.ok && res.data) {
              authService.setSession(res.data.expiresAt);
              store.reset();
              const u = res.data.user;
              store.state.user = {
                ...store.state.user,
                id: u?.id || '',
                authed: true,
                name: u?.name || u?.username || em.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                email: em,
                avatarInitial: em[0].toUpperCase(),
                frozen: !!u?.banned,
                kycLevel: u?.kycLevel ?? 1,
                role: u?.role || 'user',
              };
              store.commit();
              socketManager.reauth();
              if (u?.id) socketManager.subscribeUser(u.id);
              toast('Account created! Check your email for the verification code.');
              setBusy(false);
              kyc.next();
            } else {
              const errorMsg = res.error || 'Registration failed';
              const parsed: Record<string, string> = {};
              if ((res as any).details && Array.isArray((res as any).details)) {
                for (const d of (res as any).details) {
                  if (d.field && d.message) parsed[d.field] = d.message;
                }
              }
              setErr(Object.values(parsed).join('; ') || errorMsg);
              setBusy(false);
            }
          } else {
            kyc.next();
          }
        }}
        onBack={() => {
          setErr('');
          if (kyc.stepIndex <= 1) {
            kyc.reset();
            navigate('/landing');
          } else {
            kyc.back();
          }
        }}
        onSubmit={async () => {
          setBusy(true);
          setErr('');
          try {
            const res = await kycApi.submit(kycData);
            if (!res.ok) {
              setErr(res.error || 'Failed to submit KYC');
              setBusy(false);
              return;
            }
            toast('KYC submitted successfully! We\'ll review your information.', true);
            kyc.reset();
            navigate('/');
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed to submit KYC');
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
      />
    );
  }

  if (step === 1 || step === 2) {
    // Use new advanced wallet flow for creation
    return (
      <WalletFlow 
        navigate={navigate} 
        onBack={() => { setStep(0); setShowWalletFlow(false); }}
      />
    );
  }

  if (step === 3) {
    return (
      <div className="view-head">
        <h1>You're already signed in</h1>
        <div className="row mt">
          <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Mallchain Network</button>
          <button className="btn btn-ghost" onClick={() => authService.logout(navigate)}>Sign out</button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    // Wallet connection for authenticated users without wallet — "back" here
    // has nowhere to go but out, so it signs the user out.
    return (
      <WalletFlow
        navigate={navigate}
        onBack={() => authService.logout(navigate)}
      />
    );
  }

  const renderAuthForm = () => {
    return (
      <div className="auth-container">
        {/* Tab switcher */}
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            onClick={() => { setMode('login'); setErr(''); kyc.reset(); }}
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            role="tab"
            aria-selected={mode === 'login'}
          >
            Sign in
          </button>
          <button
            onClick={() => { setMode('signup'); setErr(''); kyc.goTo('create'); }}
            className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
            role="tab"
            aria-selected={mode === 'signup'}
          >
            Create account
          </button>
        </div>

        {/* Form container */}
        <div>
          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Header */}
                <div className="auth-header">
                  <BlockchainLogo />
                  <h1 className="auth-title">
                    Welcome back.
                  </h1>
                  <p className="auth-subtitle">
                    Sign in to your commerce hub.
                  </p>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {err && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="auth-error"
                    >
                      <AlertTriangle size={16} aria-hidden="true" />
                      {err}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="auth-field">
                  <label htmlFor="auth-email-login">Email address</label>
                  <div className="auth-input-wrap">
                    <Mail className="auth-input-icon" size={18} aria-hidden="true" />
                    <input
                      id="auth-email-login"
                      className="auth-input auth-input--with-icon-left"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors({}); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoCapitalize="off"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="auth-field">
                  <label htmlFor="auth-password-login">Password</label>
                  <div className="auth-input-wrap">
                    <Lock className="auth-input-icon" size={18} aria-hidden="true" />
                    <input
                      id="auth-password-login"
                      className="auth-input auth-input--with-icon-left auth-input--with-icon-right"
                      type={showPass ? 'text' : 'password'}
                      value={pass}
                      onChange={(e) => { setPass(e.target.value); setFieldErrors({}); }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="auth-pass-toggle"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPass((visible) => !visible)}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* 2FA if needed */}
                {requires2fa && (
                  <div className="auth-field">
                    <label htmlFor="auth-otp-login">Authenticator code</label>
                    <input
                      id="auth-otp-login"
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="6-digit code"
                      autoComplete="one-time-code"
                    />
                  </div>
                )}

                {/* Remember me + Forgot password */}
                <div className="auth-options">
                  <label className="auth-checkbox">
                    <input type="checkbox" defaultChecked />
                    <span>Remember me on this device</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setRecoveryMode(true); setErr(''); }}
                    className="auth-footer-btn"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Sign in button */}
                <button
                  onClick={submitAuth}
                  disabled={busy || (requires2fa && !otp)}
                  className="auth-submit"
                >
                  {busy ? 'Processing...' : 'Sign in'}
                </button>

                {/* Google login */}
                <button
                  onClick={() => {
                    window.location.href = `${config.apiBaseUrl}/api/auth/google`;
                  }}
                  className="auth-social-btn"
                >
                  <Globe size={16} style={{ color: '#4285F4' }} />
                  Continue with Google
                </button>

                {/* Recovery mode */}
                {recoveryMode && (
                  <div className="auth-recovery">
                    <h3 className="auth-recovery-title">Recover wallet</h3>
                    <p className="auth-recovery-desc">
                      Enter your recovery phrase to restore access.
                    </p>
                    <div className="auth-field">
                      <label>Recovery phrase</label>
                      <textarea
                        value={recoveryMnemonic}
                        onChange={(e) => setRecoveryMnemonic(e.target.value)}
                        placeholder="word1 word2 word3 ..."
                        rows={3}
                        className="auth-recovery-input auth-recovery-textarea"
                      />
                    </div>
                    <div className="auth-field">
                      <label>New password</label>
                      <input
                        type="password"
                        value={recoveryPassword}
                        onChange={(e) => setRecoveryPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="auth-recovery-input"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={recoverWallet}
                        disabled={busy}
                        className="auth-recovery-submit"
                      >
                        Recover wallet
                      </button>
                      <button
                        onClick={() => { setRecoveryMode(false); setRecoveryMnemonic(''); setRecoveryPassword(''); }}
                        className="auth-recovery-back"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Header */}
                <div style={{ marginBottom: 28, textAlign: 'center' }}>
                  <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--txt-1)', fontFamily: 'monospace' }}>
                    Create your account.
                  </h1>
                  <p style={{ fontSize: 14, color: 'var(--txt-3)', margin: 0 }}>
                    Start your journey on the decentralized web.
                  </p>
                </div>

                {/* Step indicator */}
                <div style={{ fontSize: 12, color: 'var(--txt-3)', marginBottom: 24, textAlign: 'center' }}>
                  Step 1 of 7. Verifying your identity takes about five minutes. You will need a valid government ID and a camera or photo of yourself.
                </div>

                {/* Error */}
                <AnimatePresence>
                  {err && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="kyc-error"
                      style={{ marginBottom: 20 }}
                    >
                      <AlertTriangle size={16} aria-hidden="true" />
                      {err}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="kyc-field">
                  <label htmlFor="auth-email-signup">Email address</label>
                  <input
                    id="auth-email-signup"
                    type="email"
                    value={kycData.email}
                    onChange={(e) => kyc.setData({ email: e.target.value })}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoCapitalize="off"
                  />
                </div>

                {/* Password */}
                <div className="kyc-field">
                  <label htmlFor="auth-password-signup">Password</label>
                  <input
                    id="auth-password-signup"
                    type={showPass ? 'text' : 'password'}
                    value={kycData.password}
                    onChange={(e) => kyc.setData({ password: e.target.value })}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                {/* Confirm password */}
                <div className="kyc-field">
                  <label htmlFor="auth-confirm-signup">Confirm password</label>
                  <input
                    id="auth-confirm-signup"
                    type={showPass ? 'text' : 'password'}
                    value={kycData.confirmPassword}
                    onChange={(e) => kyc.setData({ confirmPassword: e.target.value })}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                  />
                </div>

                {/* Referral code */}
                <div className="kyc-field">
                  <label htmlFor="auth-referral">Referral code (optional)</label>
                  <input
                    id="auth-referral"
                    type="text"
                    value={kycData.referralCode}
                    onChange={(e) => kyc.setData({ referralCode: e.target.value })}
                    placeholder="MALL-XXXXXXXX"
                    autoComplete="off"
                  />
                </div>

                {/* Checkboxes */}
                <label className="kyc-checkbox" style={{ marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={kycData.confirmAge}
                    onChange={(e) => kyc.setData({ confirmAge: e.target.checked })}
                  />
                  <span>I confirm I am at least 18 years old</span>
                </label>

                <label className="kyc-checkbox" style={{ marginBottom: 24 }}>
                  <input
                    type="checkbox"
                    checked={kycData.acceptTerms}
                    onChange={(e) => kyc.setData({ acceptTerms: e.target.checked })}
                  />
                  <span>I agree to the Terms of Service and Privacy Policy</span>
                </label>

                {/* Continue button */}
                <button
                  onClick={async () => {
                    setErr('');
                    const { email: em, password: pw, confirmPassword: cpw, acceptTerms: terms, confirmAge: ageOk } = kycData;
                    if (!em || !em.includes('@')) { setErr('Enter a valid email address.'); return; }
                    if (!pw || pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
                    if (pw !== cpw) { setErr('Passwords do not match.'); return; }
                    if (!ageOk) { setErr('You must confirm you are at least 18 years old.'); return; }
                    if (!terms) { setErr('You must agree to the Terms of Service.'); return; }
                    setBusy(true);
                    const res = await api.post<AuthResponse>('/api/auth/register', {
                      email: em,
                      password: pw,
                      referralCode: kycData.referralCode.trim() || undefined,
                    });
                    if (res.ok && res.data) {
                      authService.setSession(res.data.expiresAt);
                      store.reset();
                      const u = res.data.user;
                      store.state.user = {
                        ...store.state.user,
                        id: u?.id || '',
                        authed: true,
                        name: u?.name || u?.username || em.split('@')[0],
                        email: em,
                        avatarInitial: em[0].toUpperCase(),
                        frozen: !!u?.banned,
                        kycLevel: u?.kycLevel ?? 1,
                        role: u?.role || 'user',
                      };
                      store.commit();
                      socketManager.reauth();
                      if (u?.id) socketManager.subscribeUser(u.id);
                      toast('Account created! Check your email for the verification code.');
                      setBusy(false);
                      kyc.next();
                    } else {
                      setErr(res.error || 'Registration failed');
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  className="kyc-btn kyc-btn-primary"
                  style={{ width: '100%', marginBottom: 16 }}
                >
                  {busy ? 'Creating account...' : 'Continue'}
                </button>

                {/* Google login */}
                <button
                  onClick={() => {
                    window.location.href = `${config.apiBaseUrl}/api/auth/google`;
                  }}
                  style={{
                    width: '100%',
                    padding: 12,
                    background: 'var(--bg-1)',
                    border: '1.5px solid var(--line-1)',
                    borderRadius: 8,
                    color: 'var(--txt-1)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 20
                  }}
                >
                  <Globe size={16} style={{ color: '#4285F4' }} />
                  Continue with Google
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  // Reached only when step === 0 && kycStep === 'inactive'
  return (
    <div className="auth-page">
      <AnimatePresence mode="wait">
        {renderAuthForm()}
      </AnimatePresence>
    </div>
  );
}
