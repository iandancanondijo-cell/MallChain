import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store, WALLET_VAULT_STORAGE_KEY } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { handleApiError } from '../../services/errorHandler';
import { useWizard } from '../../hooks/useWizard';
import { validateMnemonicPhrase, generateNewMnemonic, deriveAddressFromMnemonic } from '../../services/wallet';
import { chain } from '../../services/config';
import { saveWalletCredential } from './credentialSave';
import { CipherSetup } from '../../components/CipherWall';
import { Shield, Check, AlertTriangle, Key, Wallet, ArrowLeft, ChevronRight } from 'lucide-react';
import { encryptMnemonic, decryptMnemonic, type VaultEntry } from './walletCrypto';
import { CreatePasswordStep, CreateSeedStep, CreateConfirmStep, CreateSecureStep } from './WalletCreateSteps';
import { ConnectMethodStep, ConnectRetrieveStep, ConnectImportStep } from './WalletImportSteps';

const FLOW_STEPS = [
  'landing', 'create-password', 'create-seed', 'create-confirm', 'create-secure',
  'set-cipher', 'connect-method', 'connect-retrieve', 'connect-import', 'success',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vault, setVault] = useState<VaultEntry[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WALLET_VAULT_STORAGE_KEY);
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
    } catch (error) {
      setError(`This browser could not generate a recovery phrase: ${error instanceof Error ? error.message : 'unexpected error'}`);
    }
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
    // The vault copy is keyed off the wallet password, so an unset password
    // would encrypt under an empty key — "stored" on screen, unreadable ever
    // after, with nothing left to blame but the user.
    if (!password || password.length < 8) {
      setError('Set a wallet password of at least 8 characters before storing the phrase here.');
      return;
    }
    try {
      const enc = await encryptMnemonic(seedWords.join(' '), password);
      const entry: VaultEntry = { address: walletAddress, ...enc, savedAt: Date.now() };
      const newVault = [...vault.filter(v => v.address !== walletAddress), entry];
      try {
        localStorage.setItem(WALLET_VAULT_STORAGE_KEY, JSON.stringify(newVault));
      } catch (storageError) {
        // Don't claim a copy the browser refused to keep.
        setError(`This browser would not keep the encrypted phrase (${storageError instanceof Error ? storageError.name : 'storage unavailable'}). Use the downloaded backup or the cold-storage option instead.`);
        return;
      }
      setVault(newVault);
      setSecuredMethod(prev => ({ ...prev, stored: true }));
      toast('Phrase encrypted and stored');
    } catch (error) {
      setError(`Could not encrypt the phrase on this device: ${error instanceof Error ? error.message : 'the crypto operation failed'}`);
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
      setError('Please choose at least one security method'); return;
    }
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(seedWords.join(' '));
      setPendingWallet({ mnemonic: seedWords.join(' '), address: info.address });
      goTo('set-cipher');
    } catch (error) {
      setError(`Could not finish creating the wallet: ${error instanceof Error ? error.message : 'unexpected error'}`);
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
        try {
          localStorage.setItem(WALLET_VAULT_STORAGE_KEY, JSON.stringify(newVault));
        } catch (storageError) {
          setError(`This browser would not keep the encrypted phrase (${storageError instanceof Error ? storageError.name : 'storage unavailable'}), so the wallet was not imported. Free up storage and try again — your recovery phrase is unchanged.`);
          setLoading(false);
          return;
        }
        setVault(newVault);
      }
      if (passwordResetMode) { toast('Password reset — this stored copy now unlocks with your new password.'); setPasswordResetMode(false); }
      setPendingWallet({ mnemonic: words.join(' '), address: info.address });
      goTo('set-cipher');
    } catch (error) {
      setError(`Could not import this phrase: ${error instanceof Error ? error.message : 'unexpected error'}`);
    }
    setLoading(false);
  };

  const handleRetrieveUnlock = async (index: number, pwd: string): Promise<string | null> => {
    const entry = vault[index];
    if (!entry) return null;
    if (!entry.saltB64 || !entry.ivB64 || !entry.cipherB64) {
      // A truncated localStorage row is not a mistyped password, and saying it
      // was is how a browser that evicted storage came to look like the user
      // had forgotten their own secret.
      setError('This stored copy is incomplete — it was never fully saved here, so no password will open it. Use your downloaded backup or your recovery phrase.');
      return null;
    }
    setLoading(true);
    try {
      const phrase = await decryptMnemonic(entry, pwd);
      toast('Phrase unlocked successfully');
      setLoading(false);
      return phrase;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setLoading(false);
      // WebCrypto reports a bad key and a corrupt payload the same way
      // (OperationError), so the honest answer covers both.
      setError(name === 'NotSupportedError'
        ? `This browser could not run the unlock: ${error instanceof Error ? error.message : 'unsupported crypto operation'}`
        : 'That password does not open this stored copy — or the copy this browser kept is not the one that was saved. Try the other password, or use your recovery phrase directly.');
      return null;
    }
  };

  const handleRetrieveContinue = async (seedWords: string[]) => {
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(seedWords.join(' '));
      setPendingWallet({ mnemonic: seedWords.join(' '), address: info.address });
      goTo('set-cipher');
    } catch (error) { setError(`Could not restore this wallet from the unlocked phrase: ${error instanceof Error ? error.message : 'unexpected error'}`); }
    setLoading(false);
  };

  const handleSetCipher = async (cipher: string) => {
    if (!pendingWallet) return;
    setLoading(true);
    try {
      st.wallet.address = pendingWallet.address;
      st.wallet.accountId = pendingWallet.address;
      st.wallet.chainId = chain.chainId;
      st.wallet.createdAt = Date.now();
      // Hash, encrypt, save AND prove — see credentialSave.ts. This screen
      // used to toast success off the in-memory assignment, so a browser that
      // refused the write handed the user a cipher that could never unlock
      // anything, and the next visit blamed them for typing it wrong.
      const saved = await saveWalletCredential(pendingWallet.mnemonic, cipher);
      if (!saved.ok) {
        setError(saved.error);
        setLoading(false);
        return;
      }
      setWalletAddress(pendingWallet.address);
      setPendingWallet(null);
      goTo('success');
    } catch (error) {
      setError(`Could not secure the wallet: ${error instanceof Error ? error.message : 'unexpected error'}`);
    }
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
        <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Wallet Setup</h1>
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

  const renderSetCipher = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>Final step</div>
      <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Choose your cipher</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 20 }}>
        Instead of a PIN, your wallet is locked by a <strong>cipher</strong>: an ordered sequence of glyphs from this wall —
        any shapes, symbols, numbers or letters. Four to twelve glyphs, whichever you engrave; that exact sequence is the one
        and only thing that unlocks this wallet when you send, stake, vote, or buy. It is never stored anywhere in plain text —
        forget it and the wallet can only be restored from the 24-word phrase you just saved.
      </p>
      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} />{error}
        </div>
      )}
      <CipherSetup onSubmit={handleSetCipher} busy={loading} error={null} />
    </motion.div>
  );

  const renderSuccess = () => (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-dim)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <Check size={32} style={{ color: 'var(--green)' }} />
      </div>
      <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{mode === 'create' ? 'Wallet created' : 'Wallet connected'}</h1>
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
        {step === 'set-cipher' && renderSetCipher()}
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
