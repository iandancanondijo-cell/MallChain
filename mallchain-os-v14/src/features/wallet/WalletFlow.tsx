import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { store, WALLET_VAULT_STORAGE_KEY } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { handleApiError } from '../../services/errorHandler';
import { useWizard } from '../../hooks/useWizard';
import { validateMnemonicPhrase, generateNewMnemonic, deriveAddressFromMnemonic, formatAddressForDisplay } from '../../services/wallet';
import { chain } from '../../services/config';
import { saveWalletCredential } from './credentialSave';
import { CipherSetup } from '../../components/CipherWall';
import { Shield, Check, AlertTriangle, Key, Wallet, ArrowLeft, ChevronRight } from 'lucide-react';
import { encryptMnemonic, decryptMnemonic, type VaultEntry } from './walletCrypto';
import { CreatePasswordStep, CreateSeedStep, CreateConfirmStep, CreateSecureStep } from './WalletCreateSteps';
import { ConnectMethodStep, ConnectRetrieveStep, ConnectImportStep } from './WalletImportSteps';
import { useWalletGate, invalidateWalletGate, canAttachAddress } from './walletGate';
import WalletGateNotice from './WalletGateNotice';

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

/**
 * Every step that builds or restores a key on this device. Verified identity
 * comes before a wallet (backend/src/middleware/requireKyc.js refuses the link
 * that attaches one to an account), so these steps are unreachable while the
 * gate refuses — otherwise the wizard would happily run someone through 24
 * words, a cipher and a backup download for a wallet the account cannot hold.
 */
const WALLET_BUILD_STEPS: FlowStep[] = [
  'create-password', 'create-seed', 'create-confirm', 'create-secure', 'set-cipher',
  'connect-method', 'connect-retrieve', 'connect-import',
];

/**
 * The steps that mint a *brand new* key. In restore mode — an unverified
 * account that already holds a wallet on the server — these are the ones that
 * must stay shut, because the address they produce is by definition not the
 * address the link route will accept. Importing a phrase stays open: it may
 * produce the one address this account is allowed to re-attach.
 */
const CREATE_STEPS: FlowStep[] = [
  'create-password', 'create-seed', 'create-confirm', 'create-secure',
];

export default function WalletFlow({ navigate, onBack }: { navigate: (p: string) => void; onBack?: () => void }) {
  useStoreVersion();
  const st = store.state;
  const { gate, refresh: refreshGate } = useWalletGate();

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

  // The wizard keeps its current step in sessionStorage, so a reload can land
  // straight on 'create-seed' without passing the landing buttons. A gate
  // refusal sends that back to the landing, where the notice says why —
  // 'checking' is left alone so a page refresh mid-flow isn't thrown out.
  // Restore mode gets the same treatment for its own half of the wizard: a
  // new key would be an address this account can never link.
  useEffect(() => {
    if (step === 'landing' || step === 'success') return;
    if (gate.blocked || (gate.restoreOnly && CREATE_STEPS.includes(step))) wizard.goTo('landing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.blocked, gate.restoreOnly]);

  useEffect(() => {
    if (step === 'create-seed' && seedWords.length === 0 && !gate.restoreOnly) generateMnemonic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, seedWords.length, gate.restoreOnly]);

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
    if (WALLET_BUILD_STEPS.includes(newStep) && !gate.allowed) {
      // Every door into key generation goes through here, so the rule is
      // enforced once rather than per-button — and the landing it falls back
      // to is where WalletGateNotice explains the reason.
      wizard.goTo('landing');
      setError('');
      return;
    }
    if (gate.restoreOnly && CREATE_STEPS.includes(newStep)) {
      wizard.goTo('landing');
      setError(`This account is not verified yet, so it can only re-connect the wallet already attached to it (${formatAddressForDisplay(gate.restoreAddress || '')}). Generating a new one would give an address that cannot be linked. Verify your identity to open full wallet setup.`);
      return;
    }
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

  /**
   * The one phrase-level check that restore mode adds: an unverified account
   * may re-attach only the address already on file (the link route matches it
   * with `allowSameAddress`), so a mismatch is caught here — before anything is
   * stored or a secret is chosen — rather than at the server, after.
   */
  const restoreMismatch = (address: string): string | null => (
    gate.restoreOnly && address !== gate.restoreAddress
      ? `That phrase belongs to ${formatAddressForDisplay(address)}, but this account is not verified and already holds ${formatAddressForDisplay(gate.restoreAddress || '')}. Only that wallet can be re-connected here. Use its recovery phrase, or verify your identity to connect a different one.`
      : null
  );

  const openCipherStep = (mnemonic: string, address: string) => {
    const mismatch = restoreMismatch(address);
    if (mismatch) {
      setPendingWallet(null);
      setError(mismatch);
      return;
    }
    setPendingWallet({ mnemonic, address });
    goTo('set-cipher');
  };

  const handleCreateWallet = async () => {
    if (!securedMethod.stored && !securedMethod.downloaded && !securedMethod.cold) {
      setError('Please choose at least one security method'); return;
    }
    setLoading(true);
    try {
      const info = await deriveAddressFromMnemonic(seedWords.join(' '));
      openCipherStep(seedWords.join(' '), info.address);
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
      const mismatch = restoreMismatch(info.address);
      if (mismatch) {
        // Before the vault write: an address this account cannot link is not
        // worth a stored copy in this browser.
        setError(mismatch);
        setLoading(false);
        return;
      }
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
      openCipherStep(words.join(' '), info.address);
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
    // Last line before a key is written to this device: the step guards above
    // can be raced by a verdict that changes mid-flow (an admin revoking while
    // the wizard is open), and a wallet nobody can link is a liability, not a
    // convenience. Nothing is saved and the pending phrase is dropped.
    if (!gate.allowed) {
      setPendingWallet(null);
      wizard.goTo('landing');
      invalidateWalletGate();
      setError('');
      return;
    }
    // Restore mode: an unverified account that already holds a wallet on the
    // server may re-attach that one address and no other — link-wallet accepts
    // it only when the body matches what is on file (allowSameAddress in
    // backend/src/routes/auth.js). Saving a cipher around a different phrase
    // would hand this person a wallet the account can never link.
    if (!canAttachAddress(gate, pendingWallet.address)) {
      setPendingWallet(null);
      wizard.goTo('landing');
      setError(`The phrase you unlocked gives a different address (${formatAddressForDisplay(pendingWallet.address)}) than the wallet already on this account (${formatAddressForDisplay(gate.restoreAddress || '')}), so nothing was saved. Use the recovery phrase for that wallet, or verify your identity to connect a new one.`);
      return;
    }
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
        <p style={{ color: 'var(--txt-3)', fontSize: 14 }}>
          {!gate.allowed
            ? 'A wallet is attached to a verified identity'
            : gate.restoreOnly
              ? 'This account can re-connect the wallet already attached to it'
              : 'Create a new wallet or connect an existing one'}
        </p>
      </div>
      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />{error}
        </div>
      )}
      {gate.allowed ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {gate.restoreOnly ? (
          <div style={{ width: '100%', padding: 20, background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 16, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={24} style={{ color: 'var(--gold)' }} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>New wallets are on hold</div>
              <div style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5 }}>
                This account is not verified yet, so it can only get back the wallet already on it
                (<strong style={{ color: 'var(--txt-2)' }}>{formatAddressForDisplay(gate.restoreAddress || '')}</strong>).
                <a href="#/kyc" style={{ display: 'block', marginTop: 6, color: 'var(--gold)', fontWeight: 600 }}>Verify your identity</a>
                to open full wallet setup.
              </div>
            </div>
          </div>
        ) : (
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
        )}
        <button onClick={() => { setMode('import'); goTo('connect-method'); }} style={{ width: '100%', padding: 20, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Key size={24} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Connect existing wallet</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>
              {gate.restoreOnly
                ? `Import the recovery phrase for ${formatAddressForDisplay(gate.restoreAddress || '')}`
                : 'Import with recovery phrase or connect a wallet app'}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>
      </div>
      ) : (
        <WalletGateNotice gate={gate} onRetry={refreshGate} />
      )}
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
