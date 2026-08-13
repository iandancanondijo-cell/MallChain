import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import { handleApiError } from '../../services/errorHandler';
import WalletFlow from '../wallet/WalletFlow';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertTriangle, Sparkles, Shield, Zap, Globe, Upload, FileText, User, MapPin, Phone, Calendar, CreditCard, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';

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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  
  // KYC/AML State
  const [kycStep, setKycStep] = useState(0);
  const [kycData, setKycData] = useState({
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
    occupation: '',
    sourceOfFunds: '',
    annualIncome: '',
    politicalExposure: false,
    acceptTerms: false
  });
  const [amlRiskLevel, setAmlRiskLevel] = useState<'low' | 'medium' | 'high' | null>(null);
  const [amlChecks, setAmlChecks] = useState({
    sanctions: false,
    pep: false,
    adverseMedia: false,
    watchlist: false
  });

  // Fetch mnemonic from backend when needed
  useEffect(() => {
    const fetchMnemonic = async () => {
      try {
        const res = await api.post<{ success: boolean; mnemonic: string }>('/api/wallet/generate-mnemonic', {});
        if (res.ok && res.data?.success) {
          setMnemonic(res.data.mnemonic);
        }
      } catch (err) {
        console.error('Failed to generate mnemonic:', err);
      }
    };

    // Only fetch when we're on wallet creation step (step 1) and don't have a mnemonic yet
    if (step === 1 && !mnemonic) {
      fetchMnemonic();
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

      // Call backend to create wallet
      const res = await api.post<{ success: boolean; address: string; accountId: string; chainId: string }>('/api/wallet/create', { mnemonic: mnemonicPhrase });
      
      if (res.ok && res.data?.success) {
        setWalletAddress(res.data.address);
        st.wallet.address = res.data.address;
        st.wallet.accountId = res.data.accountId;
        st.wallet.chainId = res.data.chainId;
        st.wallet.mnemonic = mnemonicPhrase; // Store encrypted in production
        st.wallet.createdAt = Date.now(); // Record wallet creation time
        store.commit();
        toast(`Wallet created — ${res.data.address.slice(0, 8)}...${res.data.address.slice(-6)}`);
        setBusy(false);
        setStep(2); // Go to security setup
      } else {
        setErr(res.error || 'Failed to create wallet');
        setBusy(false);
      }
    } catch (err) {
      setErr('Failed to create wallet');
      handleApiError({ ok: false, error: 'Wallet creation failed', code: 500 } as any, 
        { action: 'creating wallet', endpoint: '/api/wallet/create' }, 
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
    try {
      const res = await api.post<{ success: boolean; kycId: string; riskLevel: 'low' | 'medium' | 'high' }>('/api/kyc/submit', kycData);
      
      if (res.ok && res.data?.success) {
        setAmlRiskLevel(res.data.riskLevel);
        toast('KYC submitted successfully!');
        setBusy(false);
        setKycStep(2); // Go to AML review
      } else {
        setErr(res.error || 'KYC submission failed');
        setBusy(false);
      }
    } catch (err) {
      setErr('Failed to submit KYC');
      handleApiError({ ok: false, error: 'KYC submission failed', code: 500 } as any, 
        { action: 'submitting KYC', endpoint: '/api/kyc/submit' }, 
        false
      );
      setBusy(false);
    }
  };

  const runAMLCheck = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ success: boolean; checks: typeof amlChecks; riskLevel: 'low' | 'medium' | 'high' }>('/api/aml/check', { 
        kycData,
        walletAddress: st.wallet.address 
      });
      
      if (res.ok && res.data?.success) {
        setAmlChecks(res.data.checks);
        setAmlRiskLevel(res.data.riskLevel);
        toast('AML check completed!');
        setBusy(false);
        setKycStep(3); // Go to completion
      } else {
        setErr(res.error || 'AML check failed');
        setBusy(false);
      }
    } catch (err) {
      setErr('Failed to run AML check');
      handleApiError({ ok: false, error: 'AML check failed', code: 500 } as any, 
        { action: 'running AML check', endpoint: '/api/aml/check' }, 
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
      const res = await api.post<{ token: string; user?: unknown }>('/api/auth/register', { email, password: pass });
      
      if (res.ok && res.data?.token) {
        // Store token in localStorage
        authService.storeToken(res.data.token);
        
        // Update store auth state
        st.user = { 
          ...st.user, 
          authed: true, 
          name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 
          email, 
          avatarInitial: email[0].toUpperCase() 
        };
        store.commit();
        toast('Account created successfully!');
        setBusy(false);
        setKycStep(1); // Start KYC process
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
      const res = await api.post<{ token: string; user?: unknown }>('/api/auth/login', { email, password: pass });
      
      if (res.ok && res.data?.token) {
        // Store token in localStorage
        authService.storeToken(res.data.token);
        
        // Update store auth state
        st.user = { 
          ...st.user, 
          authed: true, 
          name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 
          email, 
          avatarInitial: email[0].toUpperCase() 
        };
        store.commit();
        toast('Welcome back to Mallchain!');
        setBusy(false);
        navigate('/');
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

  const renderKYCFlow = () => {
    const steps = [
      { title: 'Personal Information', icon: User },
      { title: 'Address & Contact', icon: MapPin },
      { title: 'Identity Verification', icon: FileText },
      { title: 'Financial Information', icon: CreditCard },
      { title: 'AML Review', icon: Shield }
    ];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        style={{ 
          maxWidth: 600, 
          margin: '0 auto', 
          padding: '40px 20px'
        }}
      >
        {/* Progress Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 8,
            marginBottom: 16
          }}>
            <Shield size={24} style={{ color: 'var(--gold)' }} />
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>
              KYC & AML Verification
            </h1>
          </div>
          <p style={{ 
            textAlign: 'center', 
            color: 'var(--txt-3)', 
            fontSize: 14,
            marginBottom: 24
          }}>
            Complete verification to unlock full platform access
          </p>
          
          {/* Progress Steps */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {steps.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i + 1 === kycStep;
              const isCompleted = i + 1 < kycStep;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isCompleted ? 'var(--green)' : isActive ? 'var(--gold)' : 'var(--bg-2)',
                    border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isCompleted ? 'var(--gold-ink)' : isActive ? 'var(--gold-ink)' : 'var(--txt-3)',
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {isCompleted ? <Check size={16} /> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ 
                      flex: 1, 
                      height: 2, 
                      background: isCompleted ? 'var(--green)' : 'var(--border-soft)' 
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={kycStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {kycStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Personal Information
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={kycData.firstName}
                    onChange={(e) => setKycData({ ...kycData, firstName: e.target.value })}
                    placeholder="John"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={kycData.lastName}
                    onChange={(e) => setKycData({ ...kycData, lastName: e.target.value })}
                    placeholder="Doe"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Date of Birth
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={18} style={{ 
                    position: 'absolute', 
                    left: 14, 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: 'var(--txt-3)'
                  }} />
                  <input
                    type="date"
                    value={kycData.dateOfBirth}
                    onChange={(e) => setKycData({ ...kycData, dateOfBirth: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 44px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Nationality
                </label>
                <input
                  type="text"
                  value={kycData.nationality}
                  onChange={(e) => setKycData({ ...kycData, nationality: e.target.value })}
                  placeholder="United States"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
            </div>
          )}

          {kycStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Address & Contact
              </h2>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Street Address
                </label>
                <input
                  type="text"
                  value={kycData.address}
                  onChange={(e) => setKycData({ ...kycData, address: e.target.value })}
                  placeholder="123 Main Street"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={kycData.city}
                    onChange={(e) => setKycData({ ...kycData, city: e.target.value })}
                    placeholder="New York"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={kycData.postalCode}
                    onChange={(e) => setKycData({ ...kycData, postalCode: e.target.value })}
                    placeholder="10001"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Country
                </label>
                <input
                  type="text"
                  value={kycData.country}
                  onChange={(e) => setKycData({ ...kycData, country: e.target.value })}
                  placeholder="United States"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Phone Number
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={18} style={{ 
                    position: 'absolute', 
                    left: 14, 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: 'var(--txt-3)'
                  }} />
                  <input
                    type="tel"
                    value={kycData.phoneNumber}
                    onChange={(e) => setKycData({ ...kycData, phoneNumber: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 44px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {kycStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Identity Verification
              </h2>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  ID Type
                </label>
                <select
                  value={kycData.idType}
                  onChange={(e) => setKycData({ ...kycData, idType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                >
                  <option value="">Select ID type</option>
                  <option value="passport">Passport</option>
                  <option value="drivers_license">Driver's License</option>
                  <option value="national_id">National ID Card</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  ID Number
                </label>
                <input
                  type="text"
                  value={kycData.idNumber}
                  onChange={(e) => setKycData({ ...kycData, idNumber: e.target.value })}
                  placeholder="A12345678"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  ID Expiry Date
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={18} style={{ 
                    position: 'absolute', 
                    left: 14, 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: 'var(--txt-3)'
                  }} />
                  <input
                    type="date"
                    value={kycData.idExpiry}
                    onChange={(e) => setKycData({ ...kycData, idExpiry: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 44px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--txt)',
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Upload ID Document
                </label>
                <div style={{
                  padding: 24,
                  background: 'var(--bg-2)',
                  border: '2px dashed var(--border)',
                  borderRadius: 12,
                  textAlign: 'center',
                  cursor: 'pointer'
                }}>
                  <Upload size={32} style={{ color: 'var(--txt-3)', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>
                    Click to upload or drag and drop
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>
                    PNG, JPG up to 10MB
                  </div>
                </div>
              </div>
            </div>
          )}

          {kycStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Financial Information
              </h2>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Occupation
                </label>
                <input
                  type="text"
                  value={kycData.occupation}
                  onChange={(e) => setKycData({ ...kycData, occupation: e.target.value })}
                  placeholder="Software Engineer"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Source of Funds
                </label>
                <select
                  value={kycData.sourceOfFunds}
                  onChange={(e) => setKycData({ ...kycData, sourceOfFunds: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                >
                  <option value="">Select source</option>
                  <option value="employment">Employment Income</option>
                  <option value="investments">Investments</option>
                  <option value="inheritance">Inheritance</option>
                  <option value="business">Business Income</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Annual Income Range
                </label>
                <select
                  value={kycData.annualIncome}
                  onChange={(e) => setKycData({ ...kycData, annualIncome: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                >
                  <option value="">Select range</option>
                  <option value="0-25000">$0 - $25,000</option>
                  <option value="25000-50000">$25,000 - $50,000</option>
                  <option value="50000-100000">$50,000 - $100,000</option>
                  <option value="100000-250000">$100,000 - $250,000</option>
                  <option value="250000+">$250,000+</option>
                </select>
              </div>

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
                  checked={kycData.politicalExposure}
                  onChange={(e) => setKycData({ ...kycData, politicalExposure: e.target.checked })}
                  style={{ marginTop: 2, accentColor: 'var(--gold)' }} 
                />
                <span>
                  I am a Politically Exposed Person (PEP) or have close family members who are PEPs
                </span>
              </label>
            </div>
          )}

          {kycStep === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                AML Risk Assessment
              </h2>

              <div style={{
                padding: 20,
                background: 'var(--bg-2)',
                borderRadius: 12,
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <AlertCircle size={20} style={{ color: amlRiskLevel === 'low' ? 'var(--green)' : amlRiskLevel === 'medium' ? 'var(--gold)' : 'var(--red)' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    Risk Level: {amlRiskLevel?.toUpperCase() || 'PENDING'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries({
                    sanctions: 'Sanctions Screening',
                    pep: 'PEP Screening',
                    adverseMedia: 'Adverse Media Check',
                    watchlist: 'Watchlist Screening'
                  }).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: amlChecks[key as keyof typeof amlChecks] ? 'var(--green)' : 'var(--bg)',
                        border: `1px solid ${amlChecks[key as keyof typeof amlChecks] ? 'var(--green)' : 'var(--border)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {amlChecks[key as keyof typeof amlChecks] && <Check size={12} style={{ color: 'var(--gold-ink)' }} />}
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--txt-2)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {amlRiskLevel === 'low' && (
                <div style={{
                  padding: 16,
                  background: 'var(--green-dim)',
                  borderRadius: 10,
                  border: '1px solid var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <Check size={20} style={{ color: 'var(--green)' }} />
                  <span style={{ fontSize: 13, color: 'var(--green)' }}>
                    All checks passed. Your account is verified.
                  </span>
                </div>
              )}

              {amlRiskLevel === 'medium' && (
                <div style={{
                  padding: 16,
                  background: 'var(--gold-dim)',
                  borderRadius: 10,
                  border: '1px solid var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <AlertTriangle size={20} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontSize: 13, color: 'var(--gold)' }}>
                    Additional verification may be required.
                  </span>
                </div>
              )}

              {amlRiskLevel === 'high' && (
                <div style={{
                  padding: 16,
                  background: 'var(--red-dim)',
                  borderRadius: 10,
                  border: '1px solid var(--red)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <AlertCircle size={20} style={{ color: 'var(--red)' }} />
                  <span style={{ fontSize: 13, color: 'var(--red)' }}>
                    Your account requires manual review. Please contact support.
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Navigation Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          marginTop: 32,
          justifyContent: 'space-between'
        }}>
          {kycStep > 1 && kycStep < 5 && (
            <button
              onClick={() => setKycStep(kycStep - 1)}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--txt-3)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <ChevronLeft size={16} />
              Back
            </button>
          )}

          {kycStep < 4 && (
            <button
              onClick={() => setKycStep(kycStep + 1)}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, var(--gold), #c9781a)',
                border: 'none',
                borderRadius: 10,
                color: 'var(--gold-ink)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 'auto'
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          )}

          {kycStep === 4 && (
            <button
              onClick={submitKYC}
              disabled={busy}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, var(--gold), #c9781a)',
                border: 'none',
                borderRadius: 10,
                color: 'var(--gold-ink)',
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 'auto'
              }}
            >
              {busy ? 'Processing...' : 'Submit KYC'}
              <ArrowRight size={16} />
            </button>
          )}

          {kycStep === 5 && amlRiskLevel === 'low' && (
            <button
              onClick={() => { setKycStep(0); setStep(1); }}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, var(--gold), #c9781a)',
                border: 'none',
                borderRadius: 10,
                color: 'var(--gold-ink)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 'auto'
              }}
            >
              Continue to Wallet Setup
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  if (kycStep > 0) {
    return renderKYCFlow();
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
          <button className="btn btn-ghost" onClick={() => { 
            st.user.authed = false; 
            store.commit(); 
            authService.clearToken(); // Task 4.6: Clear token on logout
            setStep(0); 
          }}>Sign out</button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    // Wallet connection for authenticated users without wallet
    return (
      <WalletFlow 
        navigate={navigate} 
        onBack={() => { 
          st.user.authed = false; 
          store.commit(); 
          authService.clearToken(); 
          setStep(0); 
        }}
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
          onClick={() => { setMode('login'); setErr(''); setConfirmPass(''); }}
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
          onClick={() => { setMode('signup'); setErr(''); setConfirmPass(''); }}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { icon: Globe, name: 'Google', color: '#4285F4' },
            { icon: Shield, name: 'Apple', color: '#000' },
            { icon: Zap, name: 'GitHub', color: '#333' }
          ].map((provider) => (
            <button
              key={provider.name}
              onClick={() => toast(`${provider.name} login (demo)`)}
              style={{
                padding: 12,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <provider.icon size={20} style={{ color: provider.color }} />
            </button>
          ))}
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
          <label style={{ 
            display: 'block', 
            fontSize: 13, 
            fontWeight: 600, 
            marginBottom: 8, 
            color: 'var(--txt-2)' 
          }}>
            Email address
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ 
              position: 'absolute', 
              left: 14, 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: 'var(--txt-3)'
            }} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
          <label style={{ 
            display: 'block', 
            fontSize: 13, 
            fontWeight: 600, 
            marginBottom: 8, 
            color: 'var(--txt-2)' 
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ 
              position: 'absolute', 
              left: 14, 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: 'var(--txt-3)'
            }} />
            <input
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
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
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
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
            <label style={{ 
              display: 'block', 
              fontSize: 13, 
              fontWeight: 600, 
              marginBottom: 8, 
              color: 'var(--txt-2)' 
            }}>
              Confirm password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ 
                position: 'absolute', 
                left: 14, 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: 'var(--txt-3)'
              }} />
              <input
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••"
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
                {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {err && (
            <motion.div
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
              <AlertTriangle size={16} />
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
          disabled={busy || (mode === 'signup' && !confirmPass)}
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
              {mode === 'login' ? 'Sign in' : 'Create account'}
              <ArrowRight size={18} />
            </>
          )}
        </button>

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
                onClick={() => { setMode('login'); setErr(''); setConfirmPass(''); }}
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

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--bg) 0%, var(--bg-2) 100%)',
      display: 'flex',
      alignItems: 'center',
      padding: '20px'
    }}>
      <AnimatePresence mode="wait">
        {step === 0 && renderAuthForm()}
        {step === 1 || step === 2 ? (
          <motion.div
            key="wallet"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}
          >
            <WalletFlow 
              navigate={navigate} 
              onBack={() => { setStep(0); setShowWalletFlow(false); }}
            />
          </motion.div>
        ) : null}
        {step === 3 && (
          <motion.div
            key="already-signed-in"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ textAlign: 'center', maxWidth: 400, margin: '0 auto' }}
          >
            <div style={{ 
              width: 64, 
              height: 64, 
              borderRadius: '50%', 
              background: 'var(--green-dim)', 
              border: '2px solid var(--green)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 24px'
            }}>
              <Check size={32} style={{ color: 'var(--green)' }} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>You're already signed in</h1>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/')}
                style={{ padding: '12px 24px' }}
              >
                Go to Mission Control
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => { 
                  st.user.authed = false; 
                  store.commit(); 
                  authService.clearToken(); 
                  setStep(0); 
                }}
                style={{ padding: '12px 24px' }}
              >
                Sign out
              </button>
            </div>
          </motion.div>
        )}
        {step === 4 && (
          <motion.div
            key="wallet-connection"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%' }}
          >
            <WalletFlow 
              navigate={navigate} 
              onBack={() => { 
                st.user.authed = false; 
                store.commit(); 
                authService.clearToken(); 
                setStep(0); 
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
