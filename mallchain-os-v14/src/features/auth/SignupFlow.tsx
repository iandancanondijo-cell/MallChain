import { useState, useEffect } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast, Stepper } from '../../components/ui';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import PasswordStrength from '../../components/PasswordStrength';
import MnemonicDisplay from '../../components/MnemonicDisplay';
import PINInput from '../../components/PINInput';
import BiometricSetup from '../../components/BiometricSetup';

/**
 * SignupFlow.tsx — Phase 1, Section 2: Signup Flow UI
 * 4-step stepper component for user registration
 * Step 0: Email/Password registration with validation
 * Step 1: Wallet creation/import toggle UI
 * Step 2: Security PIN entry and biometric setup
 * Step 3: Confirmation summary
 */

interface SignupState {
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
  walletMode: 'create' | 'import';
  mnemonic: string;
  mnemonicConfirm: string;
  pin: string;
  confirmPin: string;
  biometricEnabled: boolean;
  emailError: string;
  passwordError: string;
  confirmPasswordError: string;
  termsError: string;
  walletError: string;
  mnemonicError: string;
  pinError: string;
  confirmPinError: string;
  emailChecking: boolean;
  emailValid: boolean;
}

const STEPS = ['Email & Password', 'Wallet Setup', 'Security PIN', 'Confirmation'];

export default function SignupFlow({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  
  const [state, setState] = useState<SignupState>({
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    walletMode: 'create',
    mnemonic: '',
    mnemonicConfirm: '',
    pin: '',
    confirmPin: '',
    biometricEnabled: false,
    emailError: '',
    passwordError: '',
    confirmPasswordError: '',
    termsError: '',
    walletError: '',
    mnemonicError: '',
    pinError: '',
    confirmPinError: '',
    emailChecking: false,
    emailValid: false,
  });

  // Generate mnemonic on mount if needed
  useEffect(() => {
    if (step === 1 && !state.mnemonic && state.walletMode === 'create') {
      // Generate 12-word mnemonic (demo)
      const words = ['ocean', 'vault', 'golden', 'raptor', 'silver', 'matrix', 'cobalt', 'falcon', 'summit', 'helix', 'ember', 'quest'];
      setState(prev => ({ ...prev, mnemonic: words.join(' ') }));
    }
  }, [step, state.walletMode, state.mnemonic]);

  // Check if biometric is available
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await authService.isBiometricAvailable();
      if (available) {
        // Biometric is available but not auto-enabled, user will toggle
      }
    };
    checkBiometric();
  }, []);

  // Email validation with API check
  const validateEmail = async (email: string) => {
    // Local validation first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setState(prev => ({ ...prev, emailError: 'Email is required', emailValid: false }));
      return false;
    }
    if (!emailRegex.test(email)) {
      setState(prev => ({ ...prev, emailError: 'Enter a valid email address', emailValid: false }));
      return false;
    }

    // Check for duplicate email via API
    setState(prev => ({ ...prev, emailChecking: true, emailError: '' }));
    try {
      const res = await api.post<{ exists: boolean }>('/api/auth/check-email', { email });
      if (res.ok && res.data?.exists) {
        setState(prev => ({ ...prev, emailError: 'Email already registered', emailValid: false, emailChecking: false }));
        return false;
      }
      setState(prev => ({ ...prev, emailValid: true, emailError: '', emailChecking: false }));
      return true;
    } catch {
      // API error, but email format is valid
      setState(prev => ({ ...prev, emailValid: true, emailError: '', emailChecking: false }));
      return true;
    }
  };

  // Password validation
  const validatePassword = (password: string) => {
    if (!password) {
      setState(prev => ({ ...prev, passwordError: 'Password is required' }));
      return false;
    }
    if (password.length < 8) {
      setState(prev => ({ ...prev, passwordError: 'Password must be at least 8 characters' }));
      return false;
    }
    setState(prev => ({ ...prev, passwordError: '' }));
    return true;
  };

  // Confirm password validation
  const validateConfirmPassword = (password: string, confirmPassword: string) => {
    if (!confirmPassword) {
      setState(prev => ({ ...prev, confirmPasswordError: 'Please confirm your password' }));
      return false;
    }
    if (password !== confirmPassword) {
      setState(prev => ({ ...prev, confirmPasswordError: 'Passwords do not match' }));
      return false;
    }
    setState(prev => ({ ...prev, confirmPasswordError: '' }));
    return true;
  };

  // Mnemonic validation
  const validateMnemonic = (mnemonic: string) => {
    if (!mnemonic.trim()) {
      setState(prev => ({ ...prev, mnemonicError: 'Mnemonic is required' }));
      return false;
    }
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12) {
      setState(prev => ({ ...prev, mnemonicError: `Mnemonic must have 12 words (found ${words.length})` }));
      return false;
    }
    setState(prev => ({ ...prev, mnemonicError: '' }));
    return true;
  };

  // PIN validation
  const validatePin = (pin: string) => {
    if (!pin) {
      setState(prev => ({ ...prev, pinError: 'PIN is required' }));
      return false;
    }
    if (pin.length < 4 || pin.length > 8) {
      setState(prev => ({ ...prev, pinError: 'PIN must be 4-8 digits' }));
      return false;
    }
    if (!/^\d+$/.test(pin)) {
      setState(prev => ({ ...prev, pinError: 'PIN must contain only digits' }));
      return false;
    }
    // Check for sequences (1234, 4321, etc.)
    const isSequence = /^(\d)\1+$|^[0-9]{4,}$/.test(pin);
    if (isSequence && /^([0-9])\1+$/.test(pin)) {
      setState(prev => ({ ...prev, pinError: 'Avoid repeating digits' }));
      return false;
    }
    setState(prev => ({ ...prev, pinError: '' }));
    return true;
  };

  // Confirm PIN validation
  const validateConfirmPin = (pin: string, confirmPin: string) => {
    if (!confirmPin) {
      setState(prev => ({ ...prev, confirmPinError: 'Please confirm your PIN' }));
      return false;
    }
    if (pin !== confirmPin) {
      setState(prev => ({ ...prev, confirmPinError: 'PINs do not match' }));
      return false;
    }
    setState(prev => ({ ...prev, confirmPinError: '' }));
    return true;
  };

  // Step 0: Email & Password
  const handleStep0 = async () => {
    const emailValid = await validateEmail(state.email);
    const passwordValid = validatePassword(state.password);
    const confirmPasswordValid = validateConfirmPassword(state.password, state.confirmPassword);
    const termsValid = state.termsAccepted;

    if (!termsValid) {
      setState(prev => ({ ...prev, termsError: 'You must accept the Terms of Service' }));
      return;
    } else {
      setState(prev => ({ ...prev, termsError: '' }));
    }

    if (emailValid && passwordValid && confirmPasswordValid && termsValid) {
      setStep(1);
    }
  };

  // Step 1: Wallet Setup
  const handleStep1 = () => {
    if (state.walletMode === 'create') {
      if (!state.mnemonic) {
        setState(prev => ({ ...prev, walletError: 'Mnemonic not generated' }));
        return;
      }
      // Just advance to step 2
      setStep(2);
    } else {
      // Import mode
      const mnemonicValid = validateMnemonic(state.mnemonicConfirm);
      if (mnemonicValid) {
        // Import the mnemonic
        setState(prev => ({ ...prev, mnemonic: state.mnemonicConfirm }));
        setStep(2);
      }
    }
  };

  // Step 2: Security PIN
  const handleStep2 = () => {
    const pinValid = validatePin(state.pin);
    const confirmPinValid = validateConfirmPin(state.pin, state.confirmPin);

    if (pinValid && confirmPinValid) {
      setStep(3);
    }
  };

  // Step 3: Complete signup
  const handleStep3Complete = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user?: unknown }>('/api/auth/register', {
        email: state.email,
        password: state.password,
        mnemonic: state.mnemonic,
        pin: state.pin,
      });

      if (res.ok && res.data?.token) {
        authService.storeToken(res.data.token);
        st.user = {
          ...st.user,
          authed: true,
          name: state.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          email: state.email,
          avatarInitial: state.email[0].toUpperCase(),
        };
        // Store wallet address (mock for now)
        st.wallet.address = `0x${Math.random().toString(16).slice(2).toUpperCase().padEnd(40, '0')}`;
        store.commit();
        toast('Account created successfully! Welcome to Mallchain.');
        setTimeout(() => navigate('/'), 1500);
      } else {
        toast(res.error || 'Registration failed', false);
      }
    } catch (err) {
      toast('Registration failed: ' + String(err), false);
    } finally {
      setBusy(false);
    }
  };

  const handleNext = () => {
    switch (step) {
      case 0:
        handleStep0();
        break;
      case 1:
        handleStep1();
        break;
      case 2:
        handleStep2();
        break;
      case 3:
        handleStep3Complete();
        break;
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '40px 20px' }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div className="side-logo" style={{ justifyContent: 'center', border: 'none', fontSize: 18 }}>
          <span className="hex">M</span> Mallchain
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Create your account to get started</p>
      </div>

      {/* Stepper */}
      <Stepper steps={STEPS} current={step} />

      {/* Step 0: Email & Password */}
      {step === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="sec-title"><h2>Create your account</h2></div>

          {/* Email Field */}
          <div className="field">
            <label>Email <span className="required">*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                className={`input${state.emailError ? ' err' : state.emailValid ? ' success' : ''}`}
                type="email"
                placeholder="you@example.com"
                value={state.email}
                onChange={(e) => {
                  setState(prev => ({ ...prev, email: e.target.value, emailError: '' }));
                }}
                onBlur={() => validateEmail(state.email)}
              />
              {state.emailChecking && <span style={{ position: 'absolute', right: 12, top: 12 }} className="spin" />}
              {state.emailValid && <span style={{ position: 'absolute', right: 12, top: 12, color: 'var(--green)' }}>✓</span>}
            </div>
            {state.emailError && <div className="error-msg">⚠ {state.emailError}</div>}
          </div>

          {/* Password Field */}
          <div className="field">
            <label>Password <span className="required">*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                className={`input${state.passwordError ? ' err' : ''}`}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={state.password}
                onChange={(e) => {
                  setState(prev => ({ ...prev, password: e.target.value, passwordError: '' }));
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', right: 6, top: 5 }}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {state.passwordError && <div className="error-msg">⚠ {state.passwordError}</div>}
            {state.password && <PasswordStrength password={state.password} />}
          </div>

          {/* Confirm Password Field */}
          <div className="field">
            <label>Confirm Password <span className="required">*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                className={`input${state.confirmPasswordError ? ' err' : ''}`}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={state.confirmPassword}
                onChange={(e) => {
                  setState(prev => ({ ...prev, confirmPassword: e.target.value, confirmPasswordError: '' }));
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', right: 6, top: 5 }}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {state.confirmPasswordError && <div className="error-msg">⚠ {state.confirmPasswordError}</div>}
            {state.confirmPassword === state.password && state.confirmPassword && (
              <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 4 }}>✓ Passwords match</div>
            )}
          </div>

          {/* Terms of Service */}
          <div className="field" style={{ marginTop: 16 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={state.termsAccepted}
                onChange={(e) => {
                  setState(prev => ({ ...prev, termsAccepted: e.target.checked, termsError: '' }));
                }}
              />
              I agree to the <a style={{ color: 'var(--gold)', cursor: 'pointer' }}>Terms of Service</a> and <a style={{ color: 'var(--gold)', cursor: 'pointer' }}>Privacy Policy</a> <span className="required">*</span>
            </label>
            {state.termsError && <div className="error-msg">⚠ {state.termsError}</div>}
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary btn-block" onClick={handleNext} disabled={busy}>
              {busy && <span className="spin" />} Next Step →
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Wallet Setup */}
      {step === 1 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="sec-title">
            <h2>Set up your wallet</h2>
            <span className="hint">Create new or import existing</span>
          </div>

          {/* Mode Toggle */}
          <div className="mc-subnav" style={{ marginBottom: 16 }}>
            <button
              className={state.walletMode === 'create' ? 'on' : ''}
              onClick={() => setState(prev => ({ ...prev, walletMode: 'create', mnemonicConfirm: '' }))}
            >
              Create New
            </button>
            <button
              className={state.walletMode === 'import' ? 'on' : ''}
              onClick={() => setState(prev => ({ ...prev, walletMode: 'import' }))}
            >
              Import Existing
            </button>
          </div>

          {state.walletMode === 'create' && state.mnemonic && (
            <>
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>⚠ Important</div>
                <div style={{ fontSize: 11, color: 'var(--txt-2)', marginTop: 4, lineHeight: 1.5 }}>
                  Never share this recovery phrase with anyone. Anyone with this phrase can access your wallet and funds.
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Your Recovery Phrase</label>
                <MnemonicDisplay
                  mnemonic={state.mnemonic}
                  onCopyAll={() => {
                    navigator.clipboard.writeText(state.mnemonic);
                    toast('Recovery phrase copied to clipboard');
                  }}
                />
              </div>
            </>
          )}

          {state.walletMode === 'import' && (
            <div className="field">
              <label>Paste your 12-word recovery phrase <span className="required">*</span></label>
              <textarea
                className={`input${state.mnemonicError ? ' err' : ''}`}
                placeholder="Enter your 12 words separated by spaces..."
                value={state.mnemonicConfirm}
                onChange={(e) => {
                  const words = e.target.value.trim().split(/\s+/).length;
                  setState(prev => ({
                    ...prev,
                    mnemonicConfirm: e.target.value,
                    mnemonicError: '',
                  }));
                }}
                style={{ minHeight: 100 }}
              />
              <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 6 }}>
                {state.mnemonicConfirm.trim().split(/\s+/).filter(w => w).length} / 12 words
              </div>
              {state.mnemonicError && <div className="error-msg">⚠ {state.mnemonicError}</div>}
            </div>
          )}

          {state.walletError && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>⚠ {state.walletError}</div>}

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 24, gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleBack}>← Back</button>
            <button className="btn btn-primary" onClick={handleNext}>Continue →</button>
          </div>
        </div>
      )}

      {/* Step 2: Security PIN */}
      {step === 2 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="sec-title">
            <h2>Set your security PIN</h2>
            <span className="hint">Protect your wallet with a PIN</span>
          </div>

          <div style={{ background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.2)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>ℹ PIN Requirements</div>
            <div style={{ fontSize: 11, color: 'var(--txt-2)', marginTop: 4, lineHeight: 1.6 }}>
              • 4-8 digits • Don't use obvious sequences • Different from password
            </div>
          </div>

          {/* PIN Input */}
          <div className="field">
            <label>PIN <span className="required">*</span></label>
            <PINInput
              value={state.pin}
              onChange={(value) => {
                setState(prev => ({ ...prev, pin: value, pinError: '' }));
              }}
              error={!!state.pinError}
            />
            {state.pinError && <div className="error-msg">⚠ {state.pinError}</div>}
          </div>

          {/* Confirm PIN */}
          <div className="field">
            <label>Confirm PIN <span className="required">*</span></label>
            <PINInput
              value={state.confirmPin}
              onChange={(value) => {
                setState(prev => ({ ...prev, confirmPin: value, confirmPinError: '' }));
              }}
              error={!!state.confirmPinError}
            />
            {state.confirmPinError && <div className="error-msg">⚠ {state.confirmPinError}</div>}
            {state.confirmPin && state.pin === state.confirmPin && (
              <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 4 }}>✓ PINs match</div>
            )}
          </div>

          {/* Biometric Setup */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line-1)' }}>
            <BiometricSetup
              enabled={state.biometricEnabled}
              onChange={(enabled) => setState(prev => ({ ...prev, biometricEnabled: enabled }))}
            />
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 24, gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleBack}>← Back</button>
            <button className="btn btn-primary" onClick={handleNext}>Review →</button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation Summary */}
      {step === 3 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="sec-title">
            <h2>Review your details</h2>
            <span className="hint">Make sure everything looks correct</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase' }}>Email</div>
              <div style={{ fontSize: 14, color: 'var(--txt-1)', marginTop: 4, fontWeight: 500 }}>{state.email}</div>
            </div>

            <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase' }}>Wallet Mode</div>
              <div style={{ fontSize: 14, color: 'var(--txt-1)', marginTop: 4, fontWeight: 500 }}>
                {state.walletMode === 'create' ? 'New Wallet (12-word phrase generated)' : 'Imported Wallet'}
              </div>
            </div>

            <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, textTransform: 'uppercase' }}>Security</div>
              <div style={{ fontSize: 14, color: 'var(--txt-1)', marginTop: 4, fontWeight: 500 }}>
                PIN: {state.pin.replace(/./g, '•')} {state.biometricEnabled && '+ Biometric enabled'}
              </div>
            </div>

            <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ All steps complete</div>
              <div style={{ fontSize: 11, color: 'var(--txt-2)', marginTop: 6, lineHeight: 1.5 }}>
                Click "Create Account" to complete your registration. You'll be redirected to your dashboard.
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 24, gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleBack}>← Back</button>
            <button className="btn btn-primary" onClick={handleNext} disabled={busy}>
              {busy && <span className="spin" />} Create Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
