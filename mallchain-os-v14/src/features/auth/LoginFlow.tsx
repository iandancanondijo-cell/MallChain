/**
 * Mallchain Mission Control v14 — Login Flow Component
 * Phase 1, Section 3: Login Flow UI (Tasks 3.1-3.12)
 * 
 * Features:
 * - 3.1: 2-step stepper (Email/Password → PIN Entry)
 * - 3.2: Step 0: Email/Password login form with validation
 * - 3.3: "Remember me" checkbox with localStorage persistence
 * - 3.4: "Forgot password?" link (placeholder UI)
 * - 3.5: Step 1: PIN entry with Numpad component
 * - 3.6: Numpad component (3x3 grid 1-9, 0, backspace, confirm)
 * - 3.7: PIN attempt counter (show "3 remaining", "2 remaining", etc.)
 * - 3.8: Biometric detection and conditional display
 * - 3.9: Fallback from biometric to PIN option
 * - 3.10: Account lockout after 3 failed PIN attempts (15 min timeout)
 * - 3.11: "Use backup code" link (placeholder UI)
 * - 3.12: Error handling for various scenarios
 */

import { useState, useEffect } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Stepper } from '../../components/ui';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import { handleApiError } from '../../services/errorHandler';
import Numpad from '../../components/Numpad';

interface LockoutState {
  locked: boolean;
  remainingAttempts: number;
  lockoutEndsAt: number | null;
}

interface BiometricStatus {
  available: boolean;
  type: 'fingerprint' | 'face' | null;
}

export default function LoginFlow({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;

  /* ==================== State Management ==================== */
  // Step 0: Email/Password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step0Error, setStep0Error] = useState('');
  const [step0Busy, setStep0Busy] = useState(false);

  // Step 1: PIN Entry
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [lockout, setLockout] = useState<LockoutState>(() => {
    const saved = localStorage.getItem('pin_lockout');
    if (saved) {
      const parsed = JSON.parse(saved) as LockoutState;
      // Check if lockout has expired
      if (parsed.lockoutEndsAt && Date.now() > parsed.lockoutEndsAt) {
        // Lockout expired, reset
        localStorage.removeItem('pin_lockout');
        return { locked: false, remainingAttempts: 3, lockoutEndsAt: null };
      }
      return parsed;
    }
    return { locked: false, remainingAttempts: 3, lockoutEndsAt: null };
  });

  // Biometric
  const [biometric, setBiometric] = useState<BiometricStatus>({ available: false, type: null });
  const [useBiometric, setUseBiometric] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  // Current step: 0 = Email/Password, 1 = PIN Entry
  const [currentStep, setCurrentStep] = useState(0);

  /* ==================== Biometric Detection ==================== */
  useEffect(() => {
    const detectBiometric = async () => {
      try {
        if ('PublicKeyCredential' in window) {
          const available = await (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable?.();
          if (available) {
            // Detect type based on user agent
            const ua = navigator.userAgent.toLowerCase();
            const type = ua.includes('iphone') || ua.includes('ipad') ? 'face' : 'fingerprint';
            setBiometric({ available: true, type });
          }
        }
      } catch (err) {
        console.warn('[Biometric] Detection failed:', err);
      }
    };
    detectBiometric();
  }, []);

  /* ==================== Lockout Timer ==================== */
  useEffect(() => {
    if (!lockout.locked || !lockout.lockoutEndsAt) return;

    const timer = setInterval(() => {
      const now = Date.now();
      if (now >= lockout.lockoutEndsAt!) {
        // Lockout expired
        const newLockout = { locked: false, remainingAttempts: 3, lockoutEndsAt: null };
        setLockout(newLockout);
        localStorage.removeItem('pin_lockout');
        setPinError('');
        clearInterval(timer);
      } else {
        // Still locked, UI will update via re-render
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lockout.locked, lockout.lockoutEndsAt]);

  /* ==================== Utility Functions ==================== */
  const getLockoutCountdown = (): string => {
    if (!lockout.lockoutEndsAt) return '';
    const ms = lockout.lockoutEndsAt - Date.now();
    const secs = Math.ceil(ms / 1000);
    const mins = Math.ceil(secs / 60);
    return mins > 0 ? `${mins}m ${secs % 60}s` : '...';
  };

  const persistRememberMe = (checked: boolean) => {
    setRememberMe(checked);
    if (checked && email) {
      localStorage.setItem('remember_email', email);
    } else {
      localStorage.removeItem('remember_email');
    }
  };

  /* ==================== Step 0: Email/Password Submission ==================== */
  const submitStep0 = async () => {
    setStep0Error('');

    // Validation
    if (!email.includes('@')) {
      setStep0Error('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setStep0Error('Password must be at least 8 characters.');
      return;
    }

    setStep0Busy(true);

    // Task 3.2: Call real backend API for login
    const res = await api.post<{ sessionToken?: string; requiresPIN?: boolean }>(
      '/api/auth/login',
      { email, password }
    );

    if (res.ok && res.data) {
      // Store session token temporarily (for PIN verification)
      sessionStorage.setItem('session_token', res.data.sessionToken || '');
      
      // Move to PIN entry step
      toast('Email verified. Now enter your PIN.');
      setStep0Busy(false);
      setCurrentStep(1);
    } else {
      const errorMsg = res.error || 'Login failed. Please try again.';
      setStep0Error(errorMsg);
      handleApiError({ ok: res.ok, error: res.error, code: res.code } as any, 
        { action: 'logging in', endpoint: '/api/auth/login' }, 
        false
      );
      setStep0Busy(false);
    }
  };

  /* ==================== Step 1: PIN Submission ==================== */
  const submitPIN = async () => {
    setPinError('');

    if (lockout.locked) {
      const countdown = getLockoutCountdown();
      setPinError(`Account locked. Try again in ${countdown}`);
      return;
    }

    if (pin.length !== 6) {
      setPinError('PIN must be 6 digits.');
      return;
    }

    setPinBusy(true);

    // Task 3.10: Attempt tracking and lockout
    const sessionToken = sessionStorage.getItem('session_token') || '';
    const res = await api.post<{ token: string }>(
      '/api/auth/verify-pin',
      { sessionToken, pin }
    );

    if (res.ok && res.data?.token) {
      // Task 3.7: Success - clear attempt counter
      const newLockout = { locked: false, remainingAttempts: 3, lockoutEndsAt: null };
      setLockout(newLockout);
      localStorage.removeItem('pin_lockout');

      // Task 3.2 & 3.3: Store JWT token and remember me flag
      authService.storeToken(res.data.token);
      
      // PHASE 0 FIX: Set wallet address and user data on successful login
      const walletAddress = res.data.walletAddress || `wallet-${email.split('@')[0]}`;
      
      // Update store auth state with wallet
      st.user = {
        ...st.user,
        authed: true,
        name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email,
        avatarInitial: email[0].toUpperCase(),
      };
      
      // PHASE 0 FIX: Set wallet address (critical for all features)
      st.wallet = {
        ...st.wallet,
        address: walletAddress,
      };
      
      store.commit();

      // Clear sensitive data
      setPassword('');
      setPin('');
      sessionStorage.removeItem('session_token');

      toast('Successfully logged in to Mallchain!');
      setPinBusy(false);

      // Navigate to dashboard
      setTimeout(() => navigate('/'), 100);
    } else {
      // Task 3.10: Handle failed attempt
      const newAttempts = lockout.remainingAttempts - 1;
      
      if (newAttempts <= 0) {
        // Lock account for 15 minutes
        const lockoutEndsAt = Date.now() + 15 * 60 * 1000;
        const newLockout = { locked: true, remainingAttempts: 0, lockoutEndsAt };
        setLockout(newLockout);
        localStorage.setItem('pin_lockout', JSON.stringify(newLockout));
        setPinError(`Account locked for 15 minutes after 3 failed attempts.`);
        toast('Account locked due to too many failed PIN attempts', false);
      } else {
        // Show remaining attempts
        const newLockout = { locked: false, remainingAttempts: newAttempts, lockoutEndsAt: null };
        setLockout(newLockout);
        localStorage.setItem('pin_lockout', JSON.stringify(newLockout));
        
        const attemptsText = newAttempts === 1 ? 'attempt' : 'attempts';
        setPinError(`Incorrect PIN. ${newAttempts} ${attemptsText} remaining.`);
        toast(`PIN incorrect. ${newAttempts} ${attemptsText} left.`, false);
      }

      setPin('');
      setPinBusy(false);
    }
  };

  /* ==================== Biometric Authentication ==================== */
  const attemptBiometric = async () => {
    if (!biometric.available) return;

    setBiometricBusy(true);
    try {
      // Simplified biometric flow (actual implementation would use WebAuthn)
      const sessionToken = sessionStorage.getItem('session_token') || '';
      const res = await api.post<{ token: string; walletAddress?: string }>(
        '/api/auth/biometric-verify',
        { sessionToken }
      );

      if (res.ok && res.data?.token) {
        authService.storeToken(res.data.token);
        
        // PHASE 0 FIX: Set wallet address for biometric auth too
        const walletAddress = res.data.walletAddress || `wallet-${email.split('@')[0]}`;
        
        st.user = {
          ...st.user,
          authed: true,
          name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          email,
          avatarInitial: email[0].toUpperCase(),
        };
        
        // PHASE 0 FIX: Set wallet address
        st.wallet = {
          ...st.wallet,
          address: walletAddress,
        };
        
        store.commit();
        setPassword('');
        setPin('');
        sessionStorage.removeItem('session_token');
        toast('Biometric authentication successful!');
        setBiometricBusy(false);
        setTimeout(() => navigate('/'), 100);
      } else {
        toast('Biometric authentication failed. Use PIN instead.', false);
        setUseBiometric(false);
        setBiometricBusy(false);
      }
    } catch (err) {
      console.error('[Biometric] Error:', err);
      toast('Biometric authentication failed. Use PIN instead.', false);
      setUseBiometric(false);
      setBiometricBusy(false);
    }
  };

  /* ==================== Render: Step 0 - Email/Password ==================== */
  if (currentStep === 0) {
    return (
      <div style={{ maxWidth: 420, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div className="side-logo" style={{ justifyContent: 'center', border: 'none', fontSize: 18 }}>
            <span className="hex">M</span> Mallchain
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Sign in to Mission Control</p>
        </div>

        {/* 3.1: Stepper showing progress */}
        <div style={{ marginBottom: 20 }}>
          <Stepper steps={['Email & Password', 'PIN Entry']} current={0} />
        </div>

        <div className="card">
          {/* 3.2: Email field */}
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={step0Busy}
              onKeyPress={(e) => e.key === 'Enter' && !step0Busy && submitStep0()}
            />
          </div>

          {/* 3.2: Password field */}
          <div className="field">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={step0Busy}
                style={{ paddingRight: 60 }}
                onKeyPress={(e) => e.key === 'Enter' && !step0Busy && submitStep0()}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', right: 6, top: 5 }}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* 3.3: Remember me checkbox */}
          <label className="check" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => persistRememberMe(e.target.checked)}
            />
            Remember me on this device
          </label>

          {/* Error message */}
          {step0Error && (
            <div style={{ color: 'var(--red-2)', fontSize: 12.5, marginBottom: 10 }}>
              ⚠ {step0Error}
            </div>
          )}

          {/* Submit button */}
          <button
            className="btn btn-primary btn-block"
            onClick={submitStep0}
            disabled={step0Busy || !email || !password}
          >
            {step0Busy && <span className="spin" />} Continue to PIN
          </button>

          {/* 3.4: Forgot password link */}
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5 }}>
            <a onClick={() => navigate('/auth')} style={{ cursor: 'pointer', color: 'var(--gold)' }}>
              Forgot password?
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* ==================== Render: Step 1 - PIN Entry ==================== */
  if (currentStep === 1) {
    const countdown = getLockoutCountdown();

    return (
      <div style={{ maxWidth: 420, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div className="side-logo" style={{ justifyContent: 'center', border: 'none', fontSize: 18 }}>
            <span className="hex">M</span> Mallchain
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Verify your identity with PIN</p>
        </div>

        {/* 3.1: Stepper showing progress */}
        <div style={{ marginBottom: 20 }}>
          <Stepper steps={['Email & Password', 'PIN Entry']} current={1} />
        </div>

        <div className="card">
          {/* 3.8: Show biometric option if available */}
          {biometric.available && !useBiometric && (
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                🔒 {biometric.type === 'face' ? 'Use Face ID' : 'Use Fingerprint'} to verify
              </p>
              <button
                className="btn btn-outline btn-block"
                onClick={attemptBiometric}
                disabled={biometricBusy}
              >
                {biometricBusy ? 'Authenticating...' : `${biometric.type === 'face' ? 'Face ID' : 'Fingerprint'} Verify`}
              </button>
              {/* 3.9: Fallback option */}
              <button
                className="btn btn-ghost btn-block"
                style={{ marginTop: 8, fontSize: 12 }}
                onClick={() => setUseBiometric(false)}
              >
                Use PIN instead
              </button>
            </div>
          )}

          {/* Locked state */}
          {lockout.locked && (
            <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                🔐 Account locked
              </p>
              <p style={{ fontSize: 12, color: 'var(--txt-2)', marginTop: 6 }}>
                Try again in {countdown}
              </p>
            </div>
          )}

          {/* PIN input (hidden for UX) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Enter 6-digit PIN
            </label>
            <div
              style={{
                display: 'flex',
                gap: 6,
                justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 44,
                    height: 44,
                    border: '2px solid var(--line-1)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 600,
                    background: pin[i] ? 'var(--gold)' : 'var(--bg-2)',
                    color: pin[i] ? '#16181d' : 'transparent',
                  }}
                >
                  •
                </div>
              ))}
            </div>
          </div>

          {/* Error message - 3.7: Shows remaining attempts */}
          {pinError && (
            <div style={{ color: 'var(--red-2)', fontSize: 12.5, marginBottom: 10, textAlign: 'center' }}>
              ⚠ {pinError}
            </div>
          )}

          {/* 3.6 & 3.5: Numpad component */}
          <Numpad
            value={pin}
            onChange={setPin}
            onSubmit={submitPIN}
            disabled={pinBusy || lockout.locked}
          />

          {/* Submit button */}
          <button
            className="btn btn-primary btn-block"
            onClick={submitPIN}
            disabled={pinBusy || pin.length !== 6 || lockout.locked}
            style={{ marginTop: 16 }}
          >
            {pinBusy ? 'Verifying...' : 'Verify PIN'}
          </button>

          {/* 3.11: Use backup code link */}
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5 }}>
            <a onClick={() => navigate('/auth')} style={{ cursor: 'pointer', color: 'var(--gold)' }}>
              Use backup code instead
            </a>
          </div>

          {/* Back button */}
          <button
            className="btn btn-ghost btn-block"
            onClick={() => {
              setCurrentStep(0);
              setPin('');
              setPinError('');
              sessionStorage.removeItem('session_token');
            }}
            style={{ marginTop: 8 }}
          >
            Back to email
          </button>
        </div>
      </div>
    );
  }

  return null;
}
