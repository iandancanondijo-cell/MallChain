import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { handleApiError } from '../../services/errorHandler';
import { useWizard } from '../../hooks/useWizard';
import { validateMnemonicPhrase, generateNewMnemonic, deriveAddressFromMnemonic } from '../../services/wallet';
import { chain } from '../../services/config';
import { hashPin, encryptMnemonic as encryptMnemonicWithPin } from '../../services/security';
import PINInput from '../../components/PINInput';
import { Shield, Check, AlertTriangle, Key, Wallet, ArrowLeft, ChevronRight } from 'lucide-react';
import { encryptMnemonic, decryptMnemonic, type VaultEntry } from './walletCrypto';
import { CreatePasswordStep, CreateSeedStep, CreateConfirmStep, CreateSecureStep } from './WalletCreateSteps';
import { ConnectMethodStep, ConnectRetrieveStep, ConnectImportStep } from './WalletImportSteps';

const FLOW_STEPS = [
  'landing', 'create-password', 'create-seed', 'create-confirm', 'create-secure',
  'set-pin', 'connect-method', 'connect-retrieve', 'connect-import', 'success',
] as const;
type FlowStep = typeof FLOW_STEPS[number];
type WalletMode = 'create' | 'import';

type WalletFlowData = {
  mode: WalletMode;
  password: string;
  seedWords: string[];
  seedSaved: boolean;
  walletAddress: string;
};

const INITIAL_DATA: WalletFlowData = { mode: 'create', password: '', seedWords: [], seedSaved: false, walletAddress: '' };

export default function WalletFlow({ navigate, onBack }: { navigate: (p: string) => void; onBack?: () => void }) {
  useStoreVersion();
  const st = store.state;

  const wizard = useWizard<FlowStep, WalletFlowData>({ key: 'walletCreate', tier: 'session', steps: FLOW_STEPS, initialData: INITIAL_DATA });
  const step = wizard.step;
  const mode = wizard.data.mode;
  const setMode = (m: WalletMode) => wizard.setData({ mode: m });
  const password = wizard.data.password;
  const setPassword = (p: string) => wizard.setData({ password: p });
  const seedWords = wizard.data.seedWords;
  const setSeedWords = (w: string[]) => wizard.setData({ seedWords: w });
  const seedSaved = wizard.data.seedSaved;
  const setSeedSaved = (v: boolean) => wizard.setData({ seedSaved: v });
  const walletAddress = wizard.data.walletAddress;
  const setWalletAddress = (a: string) => wizard.setData({ walletAddress: a });

  const [seedRevealed, setSeedRevealed] = useState(false);
  const [confirmPicked, setConfirmPicked] = useState<string[]>([]);
  const [confirmError, setConfirmError] = useState(false);
  const [securedMethod, setSecuredMethod] = useState({ stored: false, downloaded: false, cold: false });
  const [passwordResetMode, setPasswordResetMode] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<{ mnemonic: string; address: string } | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vault, setVault] = useState<VaultEntry[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mallchain_vault');
      if (stored) setVault(JSON.parse(stored));
    } catch (err) { console.error('Failed to load vault:', err); }
  }, []);

  useEffect(() => {
    if (step === 'create-seed' && seedWords.length === 0) generateMnemonic();
  }, [step, seedWords.length]);

  const generateMnemonic = async () => {
    setLoading(true);
    try {
      const mnemonic = generateNewMnemonic(24);
      const words = mnemonic.split(' ');
      setSeedWords(words);
      const info = await deriveAddressFromMnemonic(words.join(' '));
      setWalletAddress(info.address);
    } catch { setError('Failed to generate mnemonic'); }
    setLoading(false);
  };

  const goTo = (newStep: FlowStep) => {
    wizard.goTo(newStep);
    setError('');
    if (newStep === 'create-seed' && seedWords.length === 0) generateMnemonic();
    if (newStep === 'create-confirm') { setConfirmPicked([]); setConfirmError(false); }
    if (newStep === 'create-secure') setSecuredMethod({ stored: false, downloaded: false, cold: false });
  };

  const handleStoreEncrypted = async () => {
    try {
      const enc = await encryptMnemonic(seedWords.join(' '), password);
      const entry: VaultEntry = { address: walletAddress, ...enc, savedAt: Date.now() };
      const newVault = [...vault.filter(v => v.address !== walletAddress), entry];
      setVault(newVault);
      localStorage.setItem('mallchain_vault', JSON.stringify(newVault));
      setSecuredMethod(prev => ({ ...prev, stored: true }));
      toast('Phrase encrypted and stored');
    } catch { setError('Failed to encrypt phrase'); }
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
      setError('Please choose at least one security method'); return;
    }
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(seedWords.join(' '));
      setPendingWallet({ mnemonic: seedWords.join(' '), address: info.address });
      goTo('set-pin');
    } catch {
      setError('Failed to create wallet');
      handleApiError({ ok: false, error: 'Wallet creation failed', code: 500 } as any, { action: 'creating wallet', endpoint: 'client-side derivation' }, false);
    }
    setLoading(false);
  };

  const handleImportPhrase = async (phrase: string, importPassword: string) => {
    const validation = validateMnemonicPhrase(phrase);
    if (!validation.valid) { setError(validation.message || 'Invalid recovery phrase'); return; }
    if (importPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(words.join(' '));
      if (importPassword) {
        const enc = await encryptMnemonic(words.join(' '), importPassword);
        const entry: VaultEntry = { address: info.address, ...enc, savedAt: Date.now() };
        const newVault = [...vault.filter(v => v.address !== info.address), entry];
        setVault(newVault);
        localStorage.setItem('mallchain_vault', JSON.stringify(newVault));
      }
      if (passwordResetMode) { toast('Password reset — this wallet now unlocks with your new password.'); setPasswordResetMode(false); }
      setPendingWallet({ mnemonic: words.join(' '), address: info.address });
      goTo('set-pin');
    } catch { setError('Failed to import wallet'); }
    setLoading(false);
  };

  const handleRetrieveUnlock = async (index: number, pwd: string): Promise<string | null> => {
    if (!vault[index]) return null;
    setLoading(true);
    try {
      const phrase = await decryptMnemonic(vault[index], pwd);
      toast('Phrase unlocked successfully');
      setLoading(false);
      return phrase;
    } catch { setError('Incorrect password'); setLoading(false); return null; }
  };

  const handleRetrieveContinue = async (seedWords: string[]) => {
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(seedWords.join(' '));
      setPendingWallet({ mnemonic: seedWords.join(' '), address: info.address });
      goTo('set-pin');
    } catch { setError('Failed to restore wallet'); }
    setLoading(false);
  };

  const handleSetPin = async () => {
    if (!pendingWallet) return;
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) { setError('PIN must be 4-8 digits'); return; }
    if (pin !== confirmPin) { setError('PINs do not match'); return; }
    setLoading(true);
    try {
      const hashResult = await hashPin(pin);
      if (!hashResult.success || !hashResult.hash) { setError(hashResult.error || 'Failed to set PIN'); setLoading(false); return; }
      const encryptResult = await encryptMnemonicWithPin(pendingWallet.mnemonic, pin);
      if (!encryptResult.success || !encryptResult.encrypted) { setError(encryptResult.error || 'Failed to secure wallet'); setLoading(false); return; }
      st.wallet.address = pendingWallet.address;
      st.wallet.accountId = pendingWallet.address;
      st.wallet.chainId = chain.chainId;
      st.wallet.pinHash = hashResult.hash;
      st.wallet.pinEncryptedMnemonic = encryptResult.encrypted;
      st.wallet.createdAt = Date.now();
      store.commit();
      setWalletAddress(pendingWallet.address);
      setPendingWallet(null); setPin(''); setConfirmPin('');
      goTo('success');
    } catch { setError('Failed to secure wallet'); }
    setLoading(false);
  };

  const handleCopyAddress = () => { navigator.clipboard.writeText(walletAddress); toast('Address copied to clipboard'); };
  const handleCopySeed = () => { navigator.clipboard.writeText(seedWords.join(' ')); toast('Recovery phrase copied'); };
  const handlePaste = async (): Promise<string> => { try { return (await navigator.clipboard.readText()).trim(); } catch { setError('Clipboard access denied'); return ''; } };

  // ─── Inline renders for small steps ────────────────────────────────────────

  const renderLanding = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Wallet size={48} style={{ color: 'var(--gold)', marginBottom: 16 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Wallet Setup</h1>
        <p style={{ color: 'var(--txt-3)', fontSize: 14 }}>Create a new wallet or connect an existing one</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button onClick={() => { setMode('create'); goTo('create-password'); }} style={{ width: '100%', padding: 20, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={24} style={{ color: 'var(--gold)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Create a new wallet</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Generate a fresh wallet with 24-word recovery phrase</div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>
        <button onClick={() => { setMode('import'); goTo('connect-method'); }} style={{ width: '100%', padding: 20, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
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
        <button onClick={onBack} style={{ marginTop: 24, padding: 12, background: 'transparent', border: 'none', color: 'var(--txt-3)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          <ArrowLeft size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Back
        </button>
      )}
    </motion.div>
  );

  const renderSetPin = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>Final step</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Set a PIN</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Your PIN unlocks your recovery phrase whenever you send, stake, vote, or make a purchase — it's never stored on this device in plain text, only this PIN can unlock it.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>4-8 digit PIN</label>
          <PINInput value={pin} onChange={setPin} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>Confirm PIN</label>
          <PINInput value={confirmPin} onChange={setConfirmPin} />
        </div>
        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />{error}
          </div>
        )}
        <button onClick={handleSetPin} disabled={loading || pin.length < 4 || confirmPin.length < 4} style={{ width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12, color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Securing wallet...' : 'Secure my wallet'}
        </button>
      </div>
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-dim)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <Check size={32} style={{ color: 'var(--green)' }} />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{mode === 'create' ? 'Wallet created' : 'Wallet connected'}</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        {mode === 'create' ? 'Your new Mallchain wallet is ready to use.' : 'Your wallet has been successfully connected.'}
      </p>
      <div style={{ padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', flex: 1 }}>{walletAddress}</span>
        <button onClick={handleCopyAddress} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--txt-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Copy</button>
      </div>
      <button onClick={() => { wizard.reset(); navigate('/'); }} style={{ width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12, color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Go to dashboard
      </button>
    </motion.div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
      <AnimatePresence mode="wait">
        {step === 'landing' && renderLanding()}
        {step === 'create-password' && (
          <CreatePasswordStep password={password} setPassword={setPassword} error={error} onContinue={() => goTo('create-seed')} onBack={() => goTo('landing')} />
        )}
        {step === 'create-seed' && (
          <CreateSeedStep seedWords={seedWords} seedSaved={seedSaved} setSeedSaved={setSeedSaved} seedRevealed={seedRevealed} setSeedRevealed={setSeedRevealed} error={error} onGenerate={generateMnemonic} onCopySeed={handleCopySeed} onContinue={() => { if (!seedSaved) { setError('Please confirm you have saved your recovery phrase'); return; } goTo('create-confirm'); }} onBack={() => goTo('create-password')} />
        )}
        {step === 'create-confirm' && (
          <CreateConfirmStep seedWords={seedWords} confirmPicked={confirmPicked} setConfirmPicked={setConfirmPicked} confirmError={confirmError} error={error} onContinue={() => { if (confirmPicked.join(' ') === seedWords.join(' ')) goTo('create-secure'); else { setConfirmError(true); setError('Incorrect word order'); } }} onBack={() => goTo('create-seed')} />
        )}
        {step === 'create-secure' && (
          <CreateSecureStep securedMethod={securedMethod} setSecuredMethod={setSecuredMethod} error={error} loading={loading} onStoreEncrypted={handleStoreEncrypted} onDownloadBackup={handleDownloadBackup} onContinue={handleCreateWallet} />
        )}
        {step === 'set-pin' && renderSetPin()}
        {step === 'connect-method' && (
          <ConnectMethodStep vaultCount={vault.length} onSelectRetrieve={() => goTo('connect-retrieve')} onSelectImport={() => goTo('connect-import')} onBack={() => goTo('landing')} />
        )}
        {step === 'connect-retrieve' && (
          <ConnectRetrieveStep vault={vault} error={error} loading={loading} onUnlock={handleRetrieveUnlock} onContinueWithSeed={handleRetrieveContinue} onBack={() => goTo('connect-method')} onForgotPassword={() => { setError(''); setPasswordResetMode(true); goTo('connect-import'); }} />
        )}
        {step === 'connect-import' && (
          <ConnectImportStep passwordResetMode={passwordResetMode} error={error} loading={loading} onImport={handleImportPhrase} onPaste={handlePaste} onBack={() => { setPasswordResetMode(false); goTo('connect-method'); }} />
        )}
        {step === 'success' && renderSuccess()}
      </AnimatePresence>
    </div>
  );
}
