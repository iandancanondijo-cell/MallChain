import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import { handleApiError } from '../../services/errorHandler';
import { Shield, Lock, Download, Copy, Eye, EyeOff, RefreshCw, ChevronRight, Check, AlertTriangle, Key, Wallet, ArrowLeft } from 'lucide-react';

/**
 * Advanced Wallet Creation/Import Flow
 * 
 * Features:
 * - Multi-step wallet creation with password, seed, confirmation, security
 * - Multiple import methods (phrase, stored, provider)
 * - Encrypted local storage for recovery phrases
 * - Word bank confirmation UI
 * - Multiple security options (encrypt, download, cold storage)
 * - Integration with existing backend wallet API
 */

interface VaultEntry {
  address: string;
  saltB64: string;
  ivB64: string;
  cipherB64: string;
  savedAt: number;
}

type FlowStep = 
  | 'landing' 
  | 'create-password' 
  | 'create-seed' 
  | 'create-confirm' 
  | 'create-secure'
  | 'connect-method'
  | 'connect-retrieve'
  | 'connect-import'
  | 'success';

type WalletMode = 'create' | 'import';

export default function WalletFlow({ navigate, onBack }: { navigate: (p: string) => void; onBack?: () => void }) {
  useStoreVersion();
  const st = store.state;
  
  const [step, setStep] = useState<FlowStep>('landing');
  const [mode, setMode] = useState<WalletMode>('create');
  
  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Seed state
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [seedRevealed, setSeedRevealed] = useState(false);
  const [seedSaved, setSeedSaved] = useState(false);
  
  // Confirmation state
  const [confirmPicked, setConfirmPicked] = useState<string[]>([]);
  const [confirmError, setConfirmError] = useState(false);
  
  // Security state
  const [securedMethod, setSecuredMethod] = useState({ stored: false, downloaded: false, cold: false });
  
  // Import state
  const [importPhrase, setImportPhrase] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [retrievePassword, setRetrievePassword] = useState('');
  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [retrievedSeed, setRetrievedSeed] = useState<string[] | null>(null);
  
  // Wallet state
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Vault state
  const [vault, setVault] = useState<VaultEntry[]>([]);

  // Load vault on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mallchain_vault');
      if (stored) {
        setVault(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load vault:', err);
    }
  }, []);

  // Generate mnemonic when entering seed step
  useEffect(() => {
    if (step === 'create-seed' && seedWords.length === 0) {
      generateMnemonic();
    }
  }, [step, seedWords.length]);

  const generateMnemonic = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; mnemonic: string }>('/api/wallet/generate-mnemonic', {});
      if (res.ok && res.data?.success) {
        const words = res.data.mnemonic.split(' ');
        setSeedWords(words);
        const address = await deriveAddress(words);
        setWalletAddress(address);
      }
    } catch (err) {
      setError('Failed to generate mnemonic');
    }
    setLoading(false);
  };

  const deriveAddress = async (words: string[]): Promise<string> => {
    // Use backend to derive address from mnemonic
    try {
      const res = await api.post<{ success: boolean; address: string }>('/api/wallet/validate', { mnemonic: words.join(' ') });
      if (res.ok && res.data?.address) {
        return res.data.address;
      }
    } catch (err) {
      console.error('Failed to derive address:', err);
    }
    // Fallback: generate mock address
    return 'mall1' + Math.random().toString(16).slice(2, 32);
  };

  const getPasswordStrength = (pwd: string): number => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return Math.min(strength, 4);
  };

  const goTo = (newStep: FlowStep) => {
    setStep(newStep);
    setError('');
    if (newStep === 'create-seed' && seedWords.length === 0) {
      generateMnemonic();
    }
    if (newStep === 'create-confirm') {
      setConfirmPicked([]);
      setConfirmError(false);
    }
    if (newStep === 'create-secure') {
      setSecuredMethod({ stored: false, downloaded: false, cold: false });
    }
    if (newStep === 'connect-retrieve') {
      setRetrievePassword('');
      setRetrievedSeed(null);
    }
  };

  const handleCreatePassword = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (getPasswordStrength(password) < 2) {
      setError('Password is too weak');
      return;
    }
    goTo('create-seed');
  };

  const handleSeedContinue = () => {
    if (!seedSaved) {
      setError('Please confirm you have saved your recovery phrase');
      return;
    }
    goTo('create-confirm');
  };

  const handleWordPick = (word: string) => {
    if (confirmPicked.includes(word)) return;
    setConfirmPicked([...confirmPicked, word]);
  };

  const handleWordRemove = (index: number) => {
    const newPicked = [...confirmPicked];
    newPicked.splice(index, 1);
    setConfirmPicked(newPicked);
  };

  const handleConfirmPhrase = () => {
    if (confirmPicked.join(' ') === seedWords.join(' ')) {
      goTo('create-secure');
    } else {
      setConfirmError(true);
      setError('Incorrect word order');
    }
  };

  // Crypto helpers for encryption
  const bufToB64 = (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return btoa(String.fromCharCode(...bytes));
  };

  const b64ToBuf = (str: string): Uint8Array => {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  };

  const deriveKey = async (pwd: string, salt: Uint8Array): Promise<CryptoKey> => {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pwd),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const encryptMnemonic = async (text: string, pwd: string) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pwd, salt);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(text)
    );
    return {
      saltB64: bufToB64(salt),
      ivB64: bufToB64(iv),
      cipherB64: bufToB64(cipherBuf)
    };
  };

  const decryptMnemonic = async (entry: VaultEntry, pwd: string): Promise<string> => {
    const key = await deriveKey(pwd, b64ToBuf(entry.saltB64));
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(entry.ivB64) as BufferSource },
      key,
      b64ToBuf(entry.cipherB64) as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  };

  const handleStoreEncrypted = async () => {
    try {
      const enc = await encryptMnemonic(seedWords.join(' '), password);
      const entry: VaultEntry = {
        address: walletAddress,
        ...enc,
        savedAt: Date.now()
      };
      const newVault = [...vault.filter(v => v.address !== walletAddress), entry];
      setVault(newVault);
      localStorage.setItem('mallchain_vault', JSON.stringify(newVault));
      setSecuredMethod(prev => ({ ...prev, stored: true }));
      toast('Phrase encrypted and stored');
    } catch (err) {
      setError('Failed to encrypt phrase');
    }
  };

  const handleDownloadBackup = () => {
    const content = `Mallchain Wallet Backup\nAddress: ${walletAddress}\nRecovery phrase (24 words):\n${seedWords.join(' ')}\n\nKeep this file private. Anyone with this phrase can access your wallet.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mallchain-wallet-${walletAddress.slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSecuredMethod(prev => ({ ...prev, downloaded: true }));
    toast('Backup file downloaded');
  };

  const handleCreateWallet = async () => {
    if (!securedMethod.stored && !securedMethod.downloaded && !securedMethod.cold) {
      setError('Please choose at least one security method');
      return;
    }
    
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; address: string; accountId: string; chainId: string }>('/api/wallet/create', { mnemonic: seedWords.join(' ') });
      
      if (res.ok && res.data?.success) {
        st.wallet.address = res.data.address;
        st.wallet.accountId = res.data.accountId;
        st.wallet.chainId = res.data.chainId;
        st.wallet.mnemonic = seedWords.join(' ');
        st.wallet.createdAt = Date.now();
        store.commit();
        setWalletAddress(res.data.address);
        goTo('success');
      } else {
        setError(res.error || 'Failed to create wallet');
      }
    } catch (err) {
      setError('Failed to create wallet');
      handleApiError({ ok: false, error: 'Wallet creation failed', code: 500 } as any,
        { action: 'creating wallet', endpoint: '/api/wallet/create' },
        false
      );
    }
    setLoading(false);
  };

  const handleImportPhrase = async () => {
    const words = importPhrase.trim().split(/\s+/).filter(Boolean);
    if (words.length !== 24) {
      setError('Please enter exactly 24 words');
      return;
    }
    if (importPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; address: string; accountId: string; chainId: string }>('/api/wallet/create', { mnemonic: words.join(' ') });
      
      if (res.ok && res.data?.success) {
        const address = res.data.address;
        // Optionally store encrypted
        if (importPassword) {
          const enc = await encryptMnemonic(words.join(' '), importPassword);
          const entry: VaultEntry = {
            address,
            ...enc,
            savedAt: Date.now()
          };
          const newVault = [...vault.filter(v => v.address !== address), entry];
          setVault(newVault);
          localStorage.setItem('mallchain_vault', JSON.stringify(newVault));
        }
        
        st.wallet.address = res.data.address;
        st.wallet.accountId = res.data.accountId;
        st.wallet.chainId = res.data.chainId;
        st.wallet.mnemonic = words.join(' ');
        st.wallet.createdAt = Date.now();
        store.commit();
        setWalletAddress(res.data.address);
        goTo('success');
      } else {
        setError(res.error || 'Failed to import wallet');
      }
    } catch (err) {
      setError('Failed to import wallet');
    }
    setLoading(false);
  };

  const handleRetrieveUnlock = async () => {
    if (!vault[selectedVaultIndex]) return;
    
    setLoading(true);
    try {
      const phrase = await decryptMnemonic(vault[selectedVaultIndex], retrievePassword);
      setRetrievedSeed(phrase.split(' '));
      toast('Phrase unlocked successfully');
    } catch (err) {
      setError('Incorrect password');
    }
    setLoading(false);
  };

  const handleRetrieveContinue = async () => {
    if (!retrievedSeed) return;
    
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; address: string; accountId: string; chainId: string }>('/api/wallet/create', { mnemonic: retrievedSeed.join(' ') });
      
      if (res.ok && res.data?.success) {
        st.wallet.address = res.data.address;
        st.wallet.accountId = res.data.accountId;
        st.wallet.chainId = res.data.chainId;
        st.wallet.mnemonic = retrievedSeed.join(' ');
        st.wallet.createdAt = Date.now();
        store.commit();
        setWalletAddress(res.data.address);
        goTo('success');
      } else {
        setError(res.error || 'Failed to restore wallet');
      }
    } catch (err) {
      setError('Failed to restore wallet');
    }
    setLoading(false);
  };

  const handleProviderConnect = (provider: string) => {
    toast(`Connecting to ${provider}... (demo)`);
    setTimeout(() => {
      const mockAddress = 'mall1' + Math.random().toString(16).slice(2, 32);
      setWalletAddress(mockAddress);
      st.wallet.address = mockAddress;
      st.wallet.accountId = mockAddress;
      st.wallet.chainId = 'mallchain-1';
      st.wallet.createdAt = Date.now();
      store.commit();
      goTo('success');
    }, 1000);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    toast('Address copied to clipboard');
  };

  const handleCopySeed = () => {
    navigator.clipboard.writeText(seedWords.join(' '));
    toast('Recovery phrase copied');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setImportPhrase(text.trim());
    } catch (err) {
      setError('Clipboard access denied');
    }
  };

  // Render functions for each step
  const renderLanding = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Wallet size={48} style={{ color: 'var(--gold)', marginBottom: 16 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Wallet Setup</h1>
        <p style={{ color: 'var(--txt-3)', fontSize: 14 }}>Create a new wallet or connect an existing one</p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          onClick={() => { setMode('create'); goTo('create-password'); }}
          style={{
            width: '100%',
            padding: 20,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={24} style={{ color: 'var(--gold)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Create a new wallet</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Generate a fresh wallet with 24-word recovery phrase</div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>

        <button
          onClick={() => { setMode('import'); goTo('connect-method'); }}
          style={{
            width: '100%',
            padding: 20,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={24} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Connect existing wallet</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Import with recovery phrase or connect a wallet app</div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>
      </div>

      {onBack && (
        <button
          onClick={onBack}
          style={{
            marginTop: 24,
            padding: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--txt-3)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <ArrowLeft size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Back
        </button>
      )}
    </motion.div>
  );

  const renderCreatePassword = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('landing')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 1 of 4
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Set a wallet password</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        This unlocks your wallet on this device and encrypts your recovery phrase if you choose to store it here.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={{
                width: '100%',
                padding: 14,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--txt)',
                fontSize: 14,
                paddingRight: 50
              }}
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--txt-3)'
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i <= getPasswordStrength(password) 
                    ? getPasswordStrength(password) >= 3 ? 'var(--green)' 
                    : getPasswordStrength(password) >= 2 ? 'var(--gold)' 
                    : 'var(--red)'
                    : 'var(--border)'
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}>
            Password strength: {['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][getPasswordStrength(password)]}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
            Confirm password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              style={{
                width: '100%',
                padding: 14,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--txt)',
                fontSize: 14,
                paddingRight: 50
              }}
            />
            <button
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--txt-3)'
              }}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5 }}>
          <input type="checkbox" style={{ marginTop: 2, accentColor: 'var(--gold)' }} />
          <span>I understand that Mallchain cannot recover a lost password or recovery phrase.</span>
        </label>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <button
          onClick={handleCreatePassword}
          disabled={loading}
          style={{
            width: '100%',
            padding: 14,
            background: 'var(--gold)',
            border: 'none',
            borderRadius: 12,
            color: 'var(--gold-ink)',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1
          }}
        >
          {loading ? 'Processing...' : 'Continue'}
        </button>
      </div>
    </motion.div>
  );

  const renderCreateSeed = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('create-password')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 2 of 4
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Save your recovery phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        These 24 words are the only way to recover your wallet. Never share them with anyone.
      </p>

      <div style={{ 
        padding: 16, 
        background: 'var(--red-dim)', 
        border: '1px solid rgba(242, 86, 74, 0.3)', 
        borderRadius: 12, 
        marginBottom: 20,
        display: 'flex',
        gap: 12,
        fontSize: 13,
        color: '#ffb4ad',
        lineHeight: 1.5
      }}>
        <AlertTriangle size={20} style={{ flexShrink: 0, color: 'var(--red)' }} />
        <span>Anyone who has this phrase can take everything in your wallet.</span>
      </div>

      <div style={{ 
        position: 'relative',
        padding: 16, 
        background: 'var(--bg-2)', 
        border: '1px solid var(--border)', 
        borderRadius: 14,
        marginBottom: 16
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: 8,
          filter: seedRevealed ? 'none' : 'blur(6px)',
          transition: 'filter 0.2s',
          userSelect: seedRevealed ? 'text' : 'none'
        }}>
          {seedWords.map((word, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              background: 'var(--bg)', 
              border: '1px solid var(--border-soft)', 
              borderRadius: 8, 
              padding: 10,
              fontSize: 12
            }}>
              <span style={{ color: 'var(--txt-3)', fontSize: 11, width: 20 }}>{i + 1}.</span>
              <span style={{ fontWeight: 600 }}>{word}</span>
            </div>
          ))}
        </div>

        {!seedRevealed && (
          <div style={{
            position: 'absolute',
            inset: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(18, 22, 31, 0.8)',
            borderRadius: 10,
            backdropFilter: 'blur(2px)'
          }}>
            <button
              onClick={() => setSeedRevealed(true)}
              style={{
                padding: '10px 16px',
                background: 'var(--gold)',
                border: 'none',
                borderRadius: 8,
                color: 'var(--gold-ink)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Eye size={16} />
              Reveal phrase
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={handleCopySeed}
          style={{
            flex: 1,
            padding: 12,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--txt-3)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <Copy size={16} />
          Copy
        </button>
        <button
          onClick={generateMnemonic}
          style={{
            flex: 1,
            padding: 12,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--txt-3)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <RefreshCw size={16} />
          Generate new
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 20 }}>
        <input 
          type="checkbox" 
          checked={seedSaved}
          onChange={(e) => setSeedSaved(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--gold)' }} 
        />
        <span>I've written down my recovery phrase and stored it somewhere safe.</span>
      </label>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <button
        onClick={handleSeedContinue}
        disabled={!seedSaved}
        style={{
          width: '100%',
          padding: 14,
          background: 'var(--gold)',
          border: 'none',
          borderRadius: 12,
          color: 'var(--gold-ink)',
          fontSize: 14,
          fontWeight: 700,
          cursor: !seedSaved ? 'not-allowed' : 'pointer',
          opacity: !seedSaved ? 0.5 : 1
        }}
      >
        Continue
      </button>
    </motion.div>
  );

  const renderCreateConfirm = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('create-seed')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 3 of 4
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Confirm your phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Tap the words below in the correct order to prove you saved them.
      </p>

      <div style={{ 
        minHeight: 60,
        padding: 12,
        background: 'var(--bg-2)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center'
      }}>
        {confirmPicked.length === 0 ? (
          <span style={{ color: 'var(--txt-3)', fontSize: 13 }}>Tap words below in order</span>
        ) : (
          confirmPicked.map((word, i) => (
            <div key={i} style={{
              background: 'var(--bg)',
              border: '1px solid var(--border-soft)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span>{i + 1}. {word}</span>
              <button
                onClick={() => handleWordRemove(i)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--txt-3)',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {seedWords
          .filter(w => !confirmPicked.includes(w))
          .sort(() => Math.random() - 0.5)
          .map((word, i) => (
            <button
              key={i}
              onClick={() => handleWordPick(word)}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--txt)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {word}
            </button>
          ))}
      </div>

      {confirmError && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          That's not quite right — check the order and try again.
        </div>
      )}

      <button
        onClick={handleConfirmPhrase}
        disabled={confirmPicked.length !== seedWords.length}
        style={{
          width: '100%',
          padding: 14,
          background: 'var(--gold)',
          border: 'none',
          borderRadius: 12,
          color: 'var(--gold-ink)',
          fontSize: 14,
          fontWeight: 700,
          cursor: confirmPicked.length !== seedWords.length ? 'not-allowed' : 'pointer',
          opacity: confirmPicked.length !== seedWords.length ? 0.5 : 1
        }}
      >
        Confirm phrase
      </button>
    </motion.div>
  );

  const renderCreateSecure = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 4 of 4
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Secure your recovery phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Choose at least one way to make sure you never lose access to this wallet.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ 
          padding: 18, 
          background: 'var(--bg-2)', 
          border: `1px solid ${securedMethod.stored ? 'var(--green)' : 'var(--border)'}`, 
          borderRadius: 14,
          transition: 'border-color 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} style={{ color: 'var(--gold)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Store it, encrypted, on this device</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 12 }}>
            Locked with the wallet password you just created. You can unlock it later on this browser by entering that password again.
          </p>
          <button
            onClick={handleStoreEncrypted}
            disabled={securedMethod.stored}
            style={{
              width: '100%',
              padding: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: securedMethod.stored ? 'var(--green)' : 'var(--txt)',
              fontSize: 13,
              fontWeight: 700,
              cursor: securedMethod.stored ? 'default' : 'pointer'
            }}
          >
            {securedMethod.stored ? <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> : null}
            {securedMethod.stored ? 'Stored ✓' : 'Encrypt & store'}
          </button>
        </div>

        <div style={{ 
          padding: 18, 
          background: 'var(--bg-2)', 
          border: `1px solid ${securedMethod.downloaded ? 'var(--green)' : 'var(--border)'}`, 
          borderRadius: 14,
          transition: 'border-color 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={20} style={{ color: 'var(--blue)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Download a backup file</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 12 }}>
            Save a plain-text copy to this device or a USB drive. Anyone with this file can access your funds — keep it private.
          </p>
          <button
            onClick={handleDownloadBackup}
            disabled={securedMethod.downloaded}
            style={{
              width: '100%',
              padding: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: securedMethod.downloaded ? 'var(--green)' : 'var(--txt)',
              fontSize: 13,
              fontWeight: 700,
              cursor: securedMethod.downloaded ? 'default' : 'pointer'
            }}
          >
            {securedMethod.downloaded ? <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> : null}
            {securedMethod.downloaded ? 'Downloaded ✓' : 'Download .txt'}
          </button>
        </div>

        <div style={{ 
          padding: 18, 
          background: 'var(--bg-2)', 
          border: `1px solid ${securedMethod.cold ? 'var(--green)' : 'var(--border)'}`, 
          borderRadius: 14,
          transition: 'border-color 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--purple-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} style={{ color: 'var(--purple)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>I'll use cold storage</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 12 }}>
            I've already written this phrase on paper or a hardware device kept fully offline.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5 }}>
            <input 
              type="checkbox" 
              checked={securedMethod.cold}
              onChange={(e) => setSecuredMethod(prev => ({ ...prev, cold: e.target.checked }))}
              style={{ marginTop: 2, accentColor: 'var(--gold)' }} 
            />
            <span>Confirmed — I'm storing this myself, offline.</span>
          </label>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <button
        onClick={handleCreateWallet}
        disabled={!securedMethod.stored && !securedMethod.downloaded && !securedMethod.cold}
        style={{
          width: '100%',
          padding: 14,
          background: 'var(--gold)',
          border: 'none',
          borderRadius: 12,
          color: 'var(--gold-ink)',
          fontSize: 14,
          fontWeight: 700,
          cursor: (!securedMethod.stored && !securedMethod.downloaded && !securedMethod.cold) ? 'not-allowed' : 'pointer',
          opacity: (!securedMethod.stored && !securedMethod.downloaded && !securedMethod.cold) ? 0.5 : 1,
          marginTop: 16
        }}
      >
        {loading ? 'Creating wallet...' : 'Continue to wallet'}
      </button>
    </motion.div>
  );

  const renderConnectMethod = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('landing')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Connect Wallet
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Choose how to connect</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Pick a wallet app, retrieve a phrase you saved here before, or import one directly.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
        {['Mallchain Wallet', 'WalletConnect', 'Ledger', 'Coinbase Wallet'].map((provider) => (
          <button
            key={provider}
            onClick={() => handleProviderConnect(provider)}
            style={{
              padding: 14,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--txt)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              transition: 'border-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ 
              width: 24, 
              height: 24, 
              borderRadius: 6, 
              background: provider === 'Mallchain Wallet' ? 'linear-gradient(135deg, #ffd35c, #c9781a)' : 
                     provider === 'WalletConnect' ? '#3d95ce' :
                     provider === 'Ledger' ? '#111' :
                     '#1652f0',
              flexShrink: 0
            }} />
            {provider}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
        <span style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600, letterSpacing: 0.5 }}>OR IMPORT MANUALLY</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={() => goTo('connect-retrieve')}
          disabled={vault.length === 0}
          style={{
            width: '100%',
            padding: 18,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            cursor: vault.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transition: 'all 0.2s',
            opacity: vault.length === 0 ? 0.5 : 1
          }}
          onMouseEnter={(e) => vault.length > 0 && (e.currentTarget.style.borderColor = 'var(--gold)')}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={22} style={{ color: 'var(--gold)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Use a phrase saved in this browser</div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>
              {vault.length > 0 ? `Unlock ${vault.length} wallet${vault.length > 1 ? 's' : ''} stored here` : 'No wallets stored yet'}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>

        <button
          onClick={() => goTo('connect-import')}
          style={{
            width: '100%',
            padding: 18,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={22} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Enter a recovery phrase or key</div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>Type or paste your 24-word phrase or a private key</div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>
      </div>
    </motion.div>
  );

  const renderConnectRetrieve = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('connect-method')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 2 of 2
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Retrieve a saved phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Choose the wallet you stored on this device, then enter the password you locked it with.
      </p>

      {vault.length === 0 ? (
        <div style={{ 
          padding: 20, 
          textAlign: 'center', 
          background: 'var(--bg-2)', 
          border: '1px dashed var(--border)', 
          borderRadius: 12,
          color: 'var(--txt-3)',
          fontSize: 13
        }}>
          No recovery phrase has been stored in this browser yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {vault.map((entry, i) => (
              <label
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'var(--bg-2)',
                  border: `1px solid ${selectedVaultIndex === i ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: 10,
                  cursor: 'pointer'
                }}
              >
                <input
                  type="radio"
                  name="walletPick"
                  checked={selectedVaultIndex === i}
                  onChange={() => setSelectedVaultIndex(i)}
                  style={{ accentColor: 'var(--gold)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>
                    {entry.address.slice(0, 14)}...{entry.address.slice(-6)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>
                    Saved {new Date(entry.savedAt).toLocaleDateString()}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
              Wallet password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={retrievePassword}
                onChange={(e) => setRetrievePassword(e.target.value)}
                placeholder="Enter your password"
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <button
            onClick={handleRetrieveUnlock}
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              background: 'var(--gold)',
              border: 'none',
              borderRadius: 12,
              color: 'var(--gold-ink)',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              marginBottom: 20
            }}
          >
            {loading ? 'Unlocking...' : 'Unlock phrase'}
          </button>

          {retrievedSeed && (
            <>
              <div style={{ 
                padding: 16, 
                background: 'var(--bg-2)', 
                border: '1px solid var(--border)', 
                borderRadius: 14,
                marginBottom: 16
              }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: 8
                }}>
                  {retrievedSeed.map((word, i) => (
                    <div key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 8, 
                      background: 'var(--bg)', 
                      border: '1px solid var(--border-soft)', 
                      borderRadius: 8, 
                      padding: 10,
                      fontSize: 12
                    }}>
                      <span style={{ color: 'var(--txt-3)', fontSize: 11, width: 20 }}>{i + 1}.</span>
                      <span style={{ fontWeight: 600 }}>{word}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRetrieveContinue}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'var(--gold)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'var(--gold-ink)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? 'Restoring wallet...' : 'Continue to wallet'}
              </button>
            </>
          )}
        </>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
    </motion.div>
  );

  const renderConnectImport = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <button
        onClick={() => goTo('connect-method')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--txt-3)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
        Step 2 of 2
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Enter your recovery phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Type or paste it below, separated by single spaces, exactly as it was given to you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
            Recovery phrase or private key <span style={{ color: 'var(--txt-3)', fontWeight: 400 }}>24 words, or a private key</span>
          </label>
          <textarea
            value={importPhrase}
            onChange={(e) => setImportPhrase(e.target.value)}
            placeholder="e.g. orbit gravel maple lantern ..."
            style={{
              width: '100%',
              minHeight: 100,
              padding: 14,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--txt)',
              fontSize: 14,
              fontFamily: 'monospace',
              lineHeight: 1.5,
              resize: 'vertical'
            }}
          />
        </div>

        <button
          onClick={handlePaste}
          style={{
            padding: 12,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--txt-3)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <Copy size={16} />
          Paste from clipboard
        </button>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
            New password for this device
          </label>
          <input
            type="password"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{
              width: '100%',
              padding: 14,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--txt)',
              fontSize: 14
            }}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <button
          onClick={handleImportPhrase}
          disabled={loading}
          style={{
            width: '100%',
            padding: 14,
            background: 'var(--gold)',
            border: 'none',
            borderRadius: 12,
            color: 'var(--gold-ink)',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1
          }}
        >
          {loading ? 'Importing wallet...' : 'Import wallet'}
        </button>
      </div>
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
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
      
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {mode === 'create' ? 'Wallet created' : 'Wallet connected'}
      </h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        {mode === 'create' ? 'Your new Mallchain wallet is ready to use.' : 'Your wallet has been successfully connected.'}
      </p>

      <div style={{ 
        padding: 16, 
        background: 'var(--bg-2)', 
        border: '1px solid var(--border)', 
        borderRadius: 12,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <span style={{ 
          fontFamily: 'monospace', 
          fontSize: 13, 
          wordBreak: 'break-all',
          flex: 1 
        }}>
          {walletAddress}
        </span>
        <button
          onClick={handleCopyAddress}
          style={{
            padding: '6px 10px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--txt-3)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          Copy
        </button>
      </div>

      <button
        onClick={() => navigate('/')}
        style={{
          width: '100%',
          padding: 14,
          background: 'var(--gold)',
          border: 'none',
          borderRadius: 12,
          color: 'var(--gold-ink)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer'
        }}
      >
        Go to dashboard
      </button>
    </motion.div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
      <AnimatePresence mode="wait">
        {step === 'landing' && renderLanding()}
        {step === 'create-password' && renderCreatePassword()}
        {step === 'create-seed' && renderCreateSeed()}
        {step === 'create-confirm' && renderCreateConfirm()}
        {step === 'create-secure' && renderCreateSecure()}
        {step === 'connect-method' && renderConnectMethod()}
        {step === 'connect-retrieve' && renderConnectRetrieve()}
        {step === 'connect-import' && renderConnectImport()}
        {step === 'success' && renderSuccess()}
      </AnimatePresence>
    </div>
  );
}
