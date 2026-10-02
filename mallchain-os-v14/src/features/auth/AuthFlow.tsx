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
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertTriangle, Sparkles, Shield, Zap, Globe, Upload, FileText, User, MapPin, Phone, Calendar, CreditCard, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * KYC wizard steps. 'inactive' means the KYC flow hasn't started — kept as
 * steps[0] so `kyc.stepIndex` lines up with the legacy 0-5 numbering used
 * throughout this file's render logic (1=Personal .. 5=Review).
 */
const KYC_STEPS = ['inactive', 'personal', 'address', 'identity', 'financial', 'review'] as const;
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
  occupation: '',
  sourceOfFunds: '',
  annualIncome: '',
  politicalExposure: false,
  acceptTerms: false,
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
  const [confirmPass, setConfirmPass] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    const match = /[?&]ref=([^&]+)/.exec(window.location.hash);
    return match ? decodeURIComponent(match[1]) : '';
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
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
    initialData: INITIAL_KYC_DATA,
  });
  const kycStep = kyc.stepIndex; // 0=inactive .. 5=review, matches the legacy numeric steps below
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

  // Required fields per step, matching backend/src/routes/kyc.js's Joi schema
  // exactly (every field there is .required()). Previously Next/Submit had no
  // client-side gating at all, so a user could click straight through empty
  // fields and hit a 400 "validation_failed" from the backend — silently,
  // before the error-banner fix, and still avoidably even after it.
  const KYC_REQUIRED_FIELDS: Record<number, (keyof KycData)[]> = {
    1: ['firstName', 'lastName', 'dateOfBirth', 'nationality'],
    2: ['address', 'city', 'country', 'postalCode', 'phoneNumber'],
    3: ['idType', 'idNumber', 'idExpiry', 'idDocumentUrl'],
    4: ['occupation', 'sourceOfFunds', 'annualIncome'],
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

  const strength = () => {
    let s = 0;
    if (pass.length >= 8) s++;
    if (/[A-Z]/.test(pass)) s++;
    if (/[a-z]/.test(pass)) s++;
    if (/[0-9]/.test(pass)) s++;
    return s;
  };

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
    
    // Common validation
    if (!email.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (pass.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    
    // Signup-specific validation
    if (mode === 'signup') {
      if (pass !== confirmPass) { setErr('Passwords do not match.'); return; }
      if (strength() < 2) { setErr('Password is too weak. Please use a stronger password.'); return; }
    }
    
    setBusy(true);
    
    if (mode === 'signup') {
      // Signup flow
      const res = await api.post<AuthResponse>('/api/auth/register', {
        email,
        password: pass,
        referralCode: referralCode.trim() || undefined,
      });

      if (res.ok && res.data) {
        // The JWT was set as an httpOnly cookie by this same response —
        // only the non-secret expiry hint is recorded client-side.
        authService.setSession(res.data.expiresAt);

        // A brand-new account must start from a clean slate — reset first,
        // so any stale local data left over from a previous session/account
        // on this browser (wallet, balances, mines/staking/governance
        // caches, etc.) doesn't leak into it and make a new signup look
        // like "the same app state as before." (store.reset() reassigns
        // store.state to a fresh object, so read it fresh afterward rather
        // than the possibly-stale `st` closure captured at render time.)
        store.reset();

        // Update store auth state — id/banned/kycLevel/role come from the
        // real backend user object (toPublicUser() in authController.js),
        // not derived client-side.
        const u = res.data.user;
        store.state.user = {
          ...store.state.user,
          id: u?.id || '',
          authed: true,
          // Prefer a real name (KYC-derived) or chosen username over a guessed one.
          name: u?.name || u?.username || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          email,
          avatarInitial: email[0].toUpperCase(),
          frozen: !!u?.banned,
          kycLevel: u?.kycLevel ?? 1,
          role: u?.role || 'user',
        };
        store.commit();
        // App.tsx's own subscribeUser() call only runs once, at boot — for
        // a real signup/login within an already-open tab (no reload), that
        // effect already ran and finished before this token existed, so it
        // never fires again on its own. Without this, real-time
        // notification push (badges, governance, etc.) would silently never
        // activate for anyone who doesn't hard-refresh after signing up.
        // reauth() first — the socket connected anonymously (no token yet)
        // when App.tsx booted, and the backend's io.use() JWT middleware
        // only reads the token at connection time, so subscribeUser() below
        // would otherwise be rejected as unauthenticated.
        socketManager.reauth();
        if (u?.id) socketManager.subscribeUser(u.id);
        toast('Account created successfully!');
        setBusy(false);
        kyc.goTo('personal'); // Start KYC process
      } else {
        const errorMsg = res.error || 'Registration failed';
        console.error('Registration error details:', res);
        console.error('Validation details:', (res as any).details);
        // Show detailed validation error if available
        if ((res as any).details && (res as any).details.length > 0) {
          const fieldErrors = (res as any).details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
          setErr(`Validation failed: ${fieldErrors}`);
        } else {
          setErr(errorMsg);
        }
        handleApiError({ ok: res.ok, error: res.error, code: res.code } as any, 
          { action: 'creating account', endpoint: '/api/auth/register' }, 
          false
        );
        setBusy(false);
      }
    } else {
      // Login flow
      const res = await api.post<AuthResponse>('/api/auth/login', { email, password: pass, otp: otp || undefined });

      if (res.ok && res.data?.requires2fa) {
        setRequires2fa(true);
        setBusy(false);
        return;
      }

      if (res.ok && res.data) {
        // The JWT was set as an httpOnly cookie by this same response —
        // only the non-secret expiry hint is recorded client-side.
        authService.setSession(res.data.expiresAt);

        const u = res.data.user;
        // Only reset if this browser's cached local data belongs to a
        // DIFFERENT account than the one signing in (including the common
        // case of stale/demo data with no account attached at all, where
        // the cached id is ''). If the same account is logging back in on
        // this browser, leave local state (wallet, caches) untouched —
        // there's no server-side wallet↔account link (walletCreationController
        // never persists it), so resetting here could orphan a real wallet.
        if (store.state.user.id !== (u?.id || '')) {
          store.reset();
        }
        store.state.user = {
          ...store.state.user,
          id: u?.id || '',
          authed: true,
          // Prefer a real name (KYC-derived) or chosen username over a guessed one.
          name: u?.name || u?.username || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          email,
          avatarInitial: email[0].toUpperCase(),
          frozen: !!u?.banned,
          kycLevel: u?.kycLevel ?? 1,
          role: u?.role || 'user',
        };
        store.commit();
        // See the matching comment in the signup branch above — App.tsx's
        // boot-time subscribeUser() call has already run and won't fire
        // again for a login that happens within an already-open tab, and
        // reauth() is needed so the socket carries this session's token.
        socketManager.reauth();
        if (u?.id) socketManager.subscribeUser(u.id);
        toast('Welcome back to Mallchain!');
        setBusy(false);
        // Admin/superadmin credentials go straight to the admin control
        // center — an operator signing in has no reason to land on the
        // regular user dashboard first.
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
    }
  };


  if (kycStep > 0) {
    return (
      <KycWizard
        stepIndex={kycStep}
        data={kycData}
        setData={(data) => kyc.setData(data)}
        error={err}
        onNext={() => {
          setErr('');
          kyc.next();
        }}
        onBack={() => {
          setErr('');
          kyc.back();
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
          <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Mission Control</button>
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

  const renderAuthForm = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      style={{ 
        maxWidth: 480, 
        margin: '0 auto', 
        padding: '40px 20px'
      }}
    >
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{ textAlign: 'center', marginBottom: 40 }}
      >
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: 80, 
          height: 80, 
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gold), #c9781a)',
          marginBottom: 20,
          boxShadow: '0 8px 32px rgba(255, 211, 92, 0.3)'
        }}>
          <span style={{ 
            fontSize: 36, 
            fontWeight: 800, 
            color: 'var(--gold-ink)',
            fontFamily: 'var(--font-display)'
          }}>M</span>
        </div>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 800, 
          marginBottom: 8,
          background: 'linear-gradient(135deg, var(--txt), var(--gold))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          {mode === 'login' ? 'Welcome back' : 'Join Mallchain'}
        </h1>
        <p style={{ 
          color: 'var(--txt-3)', 
          fontSize: 15,
          lineHeight: 1.6
        }}>
          {mode === 'login' 
            ? 'Sign in to access your decentralized commerce hub'
            : 'Create your account and start building on the decentralized web'
          }
        </p>
      </motion.div>

      {/* Mode Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        style={{ 
          display: 'flex',
          background: 'var(--bg-2)',
          borderRadius: 12,
          padding: 4,
          marginBottom: 32
        }}
      >
        <button
          onClick={() => { setMode('login'); setErr(''); setConfirmPass(''); setRequires2fa(false); setOtp(''); }}
          style={{
            flex: 1,
            padding: 12,
            background: mode === 'login' ? 'var(--gold)' : 'transparent',
            border: 'none',
            borderRadius: 10,
            color: mode === 'login' ? 'var(--gold-ink)' : 'var(--txt-3)',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Sign in
        </button>
        <button
          onClick={() => { setMode('signup'); setErr(''); setConfirmPass(''); setRequires2fa(false); setOtp(''); }}
          style={{
            flex: 1,
            padding: 12,
            background: mode === 'signup' ? 'var(--gold)' : 'transparent',
            border: 'none',
            borderRadius: 10,
            color: mode === 'signup' ? 'var(--gold-ink)' : 'var(--txt-3)',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Create account
        </button>
      </motion.div>

      {/* Social Login (Demo) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 16, 
          marginBottom: 16 
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          <span style={{ fontSize: 12, color: 'var(--txt-3)', fontWeight: 600 }}>
            {mode === 'login' ? 'Or continue with' : 'Quick signup'}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {/* Apple/GitHub removed — there's no backend OAuth support for
              either (only Google has a real passport strategy wired up in
              backend/src/routes/auth.js), so those buttons only ever showed
              a "(demo)" toast. A button that can't do anything is worse than
              no button. */}
          <button
            onClick={() => {
              const ref = referralCode.trim();
              window.location.href = `${config.apiBaseUrl}/api/auth/google${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
            }}
            style={{
              padding: 12,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <Globe size={20} style={{ color: '#4285F4' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Continue with Google</span>
          </button>
        </div>
      </motion.div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {/* Email */}
        <div>
          <label htmlFor="auth-email" style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 8,
            color: 'var(--txt-2)'
          }}>
            Email address
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} aria-hidden="true" style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--txt-3)'
            }} />
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="email"
              aria-invalid={err && !email.includes('@') ? true : undefined}
              aria-describedby={err ? 'auth-form-error' : undefined}
              style={{
                width: '100%',
                padding: '14px 14px 14px 44px',
                background: 'var(--bg-2)',
                border: `1px solid ${err && !email.includes('@') ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 12,
                color: 'var(--txt)',
                fontSize: 14,
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
              onBlur={(e) => e.currentTarget.style.borderColor = err && !email.includes('@') ? 'var(--red)' : 'var(--border)'}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="auth-password" style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 8,
            color: 'var(--txt-2)'
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={18} aria-hidden="true" style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--txt-3)'
            }} />
            <input
              id="auth-password"
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-invalid={err && pass.length < 8 ? true : undefined}
              aria-describedby={err ? 'auth-form-error' : undefined}
              style={{
                width: '100%',
                padding: '14px 44px 14px 44px',
                background: 'var(--bg-2)',
                border: `1px solid ${err && pass.length < 8 ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 12,
                color: 'var(--txt)',
                fontSize: 14,
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
              onBlur={(e) => e.currentTarget.style.borderColor = err && pass.length < 8 ? 'var(--red)' : 'var(--border)'}
            />
            <button
              type="button"
              aria-label={showPass ? 'Hide password' : 'Show password'}
              aria-pressed={showPass}
              onClick={() => setShowPass(!showPass)}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--txt-3)',
                padding: 4
              }}
            >
              {showPass ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>

          {/* 2FA challenge — shown once the backend reports this account has
              real TOTP enabled (checkTwoFactor() in authController.js). */}
          {mode === 'login' && requires2fa && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="auth-otp" style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--txt-2)' }}>
                Authenticator code
              </label>
              <input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code or backup code"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--txt)',
                  fontSize: 14,
                }}
              />
            </div>
          )}

          {/* Password Strength */}
          {mode === 'signup' && pass.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ 
                display: 'flex', 
                gap: 4, 
                marginBottom: 6 
              }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: i <= strength() 
                        ? strength() >= 3 ? 'var(--green)' 
                        : strength() >= 2 ? 'var(--gold)' 
                        : 'var(--red)'
                        : 'var(--border)'
                    }}
                  />
                ))}
              </div>
              <div style={{ 
                fontSize: 12, 
                color: strength() >= 3 ? 'var(--green)' : strength() >= 2 ? 'var(--gold)' : 'var(--txt-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                {strength() >= 3 ? <Check size={12} /> : null}
                {['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][strength()]}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        {mode === 'signup' && (
          <div>
            <label htmlFor="auth-confirm-password" style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              color: 'var(--txt-2)'
            }}>
              Confirm password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} aria-hidden="true" style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--txt-3)'
              }} />
              <input
                id="auth-confirm-password"
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={err && pass !== confirmPass ? true : undefined}
                aria-describedby={err ? 'auth-form-error' : undefined}
                style={{
                  width: '100%',
                  padding: '14px 44px 14px 44px',
                  background: 'var(--bg-2)',
                  border: `1px solid ${err && pass !== confirmPass ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 12,
                  color: 'var(--txt)',
                  fontSize: 14,
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.currentTarget.style.borderColor = err && pass !== confirmPass ? 'var(--red)' : 'var(--border)'}
              />
              <button
                type="button"
                aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirmPass}
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--txt-3)',
                  padding: 4
                }}
              >
                {showConfirmPass ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}

        {/* Referral code (signup only) */}
        {mode === 'signup' && (
          <div>
            <label htmlFor="auth-referral" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
              Referral code (optional)
            </label>
            <input
              id="auth-referral"
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="MALL-XXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              style={{
                width: '100%',
                padding: '14px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--txt)',
                fontSize: 14,
              }}
            />
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {err && (
            <motion.div
              id="auth-form-error"
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                color: 'var(--red)',
                fontSize: 13,
                padding: 12,
                background: 'var(--red-dim)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <AlertTriangle size={16} aria-hidden="true" />
              {err}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Terms */}
        <label style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: 10, 
          fontSize: 13, 
          color: 'var(--txt-3)', 
          lineHeight: 1.5 
        }}>
          <input 
            type="checkbox" 
            defaultChecked 
            style={{ marginTop: 2, accentColor: 'var(--gold)' }} 
          />
          <span>
            {mode === 'login' 
              ? 'Remember me on this device'
              : 'I agree to the Terms of Service and Privacy Policy'
            }
          </span>
        </label>

        {/* Submit Button */}
        <button
          onClick={submitAuth}
          disabled={busy || (mode === 'signup' && !confirmPass) || (requires2fa && !otp)}
          style={{
            width: '100%',
            padding: 16,
            background: 'linear-gradient(135deg, var(--gold), #c9781a)',
            border: 'none',
            borderRadius: 12,
            color: 'var(--gold-ink)',
            fontSize: 15,
            fontWeight: 700,
            cursor: busy || (mode === 'signup' && !confirmPass) ? 'not-allowed' : 'pointer',
            opacity: busy || (mode === 'signup' && !confirmPass) ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 20px rgba(255, 211, 92, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => !busy && !(mode === 'signup' && !confirmPass) && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {busy ? (
            <>
              <span className="spin" style={{ width: 16, height: 16, border: '2px solid var(--gold-ink)', borderTopColor: 'transparent' }} />
              Processing...
            </>
          ) : (
            <>
              {mode === 'login' ? (requires2fa ? 'Verify code' : 'Sign in') : 'Create account'}
              <ArrowRight size={18} />
            </>
          )}
        </button>

        {/* Prominent "Already have an account?" button — shown only in signup mode */}
        {mode === 'signup' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            style={{
              padding: 16,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--txt-2)', marginBottom: 10 }}>
              Already have an account?
            </div>
            <button
              onClick={() => { setMode('login'); setErr(''); setConfirmPass(''); setRequires2fa(false); setOtp(''); }}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                border: '1px solid var(--gold)',
                borderRadius: 8,
                color: 'var(--gold)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gold-dim)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Sign in to your account
              <ArrowRight size={14} />
            </button>
          </motion.div>
        )}

        {/* Footer Links */}
        <div style={{ textAlign: 'center', fontSize: 13 }}>
          {mode === 'login' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button 
                onClick={() => toast('Password reset (demo)')}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--txt-3)', 
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                Forgot password?
              </button>
              <span style={{ color: 'var(--border-soft)' }}>·</span>
              <button 
                onClick={() => toast('2FA setup (demo)')}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--txt-3)', 
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                2FA / recovery
              </button>
            </div>
          ) : (
            <span style={{ color: 'var(--txt-3)' }}>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setErr(''); setConfirmPass(''); setRequires2fa(false); setOtp(''); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--gold)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        style={{ 
          marginTop: 40, 
          padding: 24, 
          background: 'var(--bg-2)', 
          borderRadius: 16,
          border: '1px solid var(--border-soft)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Sparkles size={20} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Why Mallchain?</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { icon: Shield, title: 'Secure', desc: 'Bank-grade security' },
            { icon: Zap, title: 'Fast', desc: 'Instant transactions' },
            { icon: Globe, title: 'Global', desc: 'Worldwide access' }
          ].map((feature) => (
            <div key={feature.title} style={{ textAlign: 'center' }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 10, 
                background: 'var(--gold-dim)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto 8'
              }}>
                <feature.icon size={20} style={{ color: 'var(--gold)' }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{feature.title}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{feature.desc}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );

  // Reached only when step === 0 && kycStep === 'inactive' — every other
  // step value already returned early above (KYC flow, wallet create/import,
  // already-signed-in, wallet connection), so this only ever renders the
  // auth form.
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--bg) 0%, var(--bg-2) 100%)',
      display: 'flex',
      alignItems: 'center',
      padding: '20px'
    }}>
      <AnimatePresence mode="wait">
        {renderAuthForm()}
      </AnimatePresence>
    </div>
  );
}
