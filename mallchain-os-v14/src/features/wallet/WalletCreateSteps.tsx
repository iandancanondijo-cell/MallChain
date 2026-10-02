import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Download, Eye, EyeOff, RefreshCw, Check, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { VaultEntry } from './walletCrypto';

const animProps = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

const getPasswordStrength = (pwd: string): number => {
  let strength = 0;
  if (pwd.length >= 8) strength++;
  if (pwd.length >= 12) strength++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) strength++;
  if (/[0-9]/.test(pwd)) strength++;
  if (/[^A-Za-z0-9]/.test(pwd)) strength++;
  return Math.min(strength, 4);
};

const backBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--txt-3)',
  cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 24,
  display: 'flex', alignItems: 'center', gap: 6,
};

const errorBox = (msg: string) => (
  <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
    <AlertTriangle size={16} />
    {msg}
  </div>
);

const primaryBtn = (disabled: boolean, loading: boolean, label: string): React.CSSProperties => ({
  width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12,
  color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});

const stepLabel = (text: string) => (
  <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
    {text}
  </div>
);

// ─── CreatePassword ──────────────────────────────────────────────────────────

export function CreatePasswordStep({
  password, setPassword, error, onContinue, onBack,
}: {
  password: string; setPassword: (p: string) => void; error: string; onContinue: () => void; onBack: () => void;
}) {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleContinue = () => {
    if (password.length < 8) return;
    if (password !== confirmPassword) return;
    if (getPasswordStrength(password) < 2) return;
    onContinue();
  };

  const strength = getPasswordStrength(password);
  const canContinue = password.length >= 8 && password === confirmPassword && strength >= 2;

  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Step 1 of 4')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Set a wallet password</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        This unlocks your wallet on this device and encrypts your recovery phrase if you choose to store it here.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"
              style={{ width: '100%', padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--txt)', fontSize: 14, paddingRight: 50 }}
            />
            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt-3)' }}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= strength ? strength >= 3 ? 'var(--green)' : strength >= 2 ? 'var(--gold)' : 'var(--red)' : 'var(--border)' }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}>
            Password strength: {['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][strength]}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>Confirm password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password"
              style={{ width: '100%', padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--txt)', fontSize: 14, paddingRight: 50 }}
            />
            <button onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt-3)' }}>
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5 }}>
          <input type="checkbox" style={{ marginTop: 2, accentColor: 'var(--gold)' }} />
          <span>I understand that Mallchain cannot recover a lost password or recovery phrase.</span>
        </label>

        {error && errorBox(error)}

        <button onClick={handleContinue} disabled={!canContinue} style={primaryBtn(!canContinue, false, 'Continue')}>
          Continue
        </button>
      </div>
    </motion.div>
  );
}

// ─── CreateSeed ──────────────────────────────────────────────────────────────

export function CreateSeedStep({
  seedWords, seedSaved, setSeedSaved, seedRevealed, setSeedRevealed, error,
  onGenerate, onCopySeed, onContinue, onBack,
}: {
  seedWords: string[]; seedSaved: boolean; setSeedSaved: (v: boolean) => void;
  seedRevealed: boolean; setSeedRevealed: (v: boolean) => void;
  error: string; onGenerate: () => void; onCopySeed: () => void;
  onContinue: () => void; onBack: () => void;
}) {
  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Step 2 of 4')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Save your recovery phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        These 24 words are the only way to recover your wallet. Never share them with anyone.
      </p>

      <div style={{ padding: 16, background: 'var(--red-dim)', border: '1px solid rgba(242, 86, 74, 0.3)', borderRadius: 12, marginBottom: 20, display: 'flex', gap: 12, fontSize: 13, color: '#ffb4ad', lineHeight: 1.5 }}>
        <AlertTriangle size={20} style={{ flexShrink: 0, color: 'var(--red)' }} />
        <span>Anyone who has this phrase can take everything in your wallet.</span>
      </div>

      <div style={{ position: 'relative', padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, filter: seedRevealed ? 'none' : 'blur(6px)', transition: 'filter 0.2s', userSelect: seedRevealed ? 'text' : 'none' }}>
          {seedWords.map((word, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--txt-3)', fontSize: 11, width: 20 }}>{i + 1}.</span>
              <span style={{ fontWeight: 600 }}>{word}</span>
            </div>
          ))}
        </div>

        {!seedRevealed && (
          <div style={{ position: 'absolute', inset: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, background: 'rgba(18, 22, 31, 0.8)', borderRadius: 10, backdropFilter: 'blur(2px)' }}>
            <button onClick={() => setSeedRevealed(true)} style={{ padding: '10px 16px', background: 'var(--gold)', border: 'none', borderRadius: 8, color: 'var(--gold-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={16} />Reveal phrase
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={onCopySeed} style={{ flex: 1, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check size={16} />Copy
        </button>
        <button onClick={onGenerate} style={{ flex: 1, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={16} />Generate new
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 20 }}>
        <input type="checkbox" checked={seedSaved} onChange={(e) => setSeedSaved(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--gold)' }} />
        <span>I've written down my recovery phrase and stored it somewhere safe.</span>
      </label>

      {error && errorBox(error)}

      <button onClick={onContinue} disabled={!seedSaved} style={primaryBtn(!seedSaved, false, 'Continue')}>
        Continue
      </button>
    </motion.div>
  );
}

// ─── CreateConfirm ───────────────────────────────────────────────────────────

export function CreateConfirmStep({
  seedWords, confirmPicked, setConfirmPicked, confirmError, error, onContinue, onBack,
}: {
  seedWords: string[]; confirmPicked: string[]; setConfirmPicked: (p: string[]) => void;
  confirmError: boolean; error: string; onContinue: () => void; onBack: () => void;
}) {
  const handleWordPick = (word: string) => {
    if (confirmPicked.includes(word)) return;
    setConfirmPicked([...confirmPicked, word]);
  };

  const handleWordRemove = (index: number) => {
    const newPicked = [...confirmPicked];
    newPicked.splice(index, 1);
    setConfirmPicked(newPicked);
  };

  const shuffled = seedWords.filter(w => !confirmPicked.includes(w)).sort(() => Math.random() - 0.5);

  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Step 3 of 4')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Confirm your phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Tap the words below in the correct order to prove you saved them.
      </p>

      <div style={{ minHeight: 60, padding: 12, background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {confirmPicked.length === 0 ? (
          <span style={{ color: 'var(--txt-3)', fontSize: 13 }}>Tap words below in order</span>
        ) : (
          confirmPicked.map((word, i) => (
            <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{i + 1}. {word}</span>
              <button onClick={() => handleWordRemove(i)} style={{ background: 'transparent', border: 'none', color: 'var(--txt-3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {shuffled.map((word, i) => (
          <button key={i} onClick={() => handleWordPick(word)} style={{ padding: '8px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--txt)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >{word}</button>
        ))}
      </div>

      {confirmError && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />That's not quite right — check the order and try again.
        </div>
      )}

      {error && errorBox(error)}

      <button onClick={onContinue} disabled={confirmPicked.length !== seedWords.length} style={primaryBtn(confirmPicked.length !== seedWords.length, false, 'Confirm phrase')}>
        Confirm phrase
      </button>
    </motion.div>
  );
}

// ─── CreateSecure ────────────────────────────────────────────────────────────

export function CreateSecureStep({
  securedMethod, setSecuredMethod, error, loading,
  onStoreEncrypted, onDownloadBackup, onContinue,
}: {
  securedMethod: { stored: boolean; downloaded: boolean; cold: boolean };
  setSecuredMethod: (m: { stored: boolean; downloaded: boolean; cold: boolean }) => void;
  error: string; loading: boolean;
  onStoreEncrypted: () => void; onDownloadBackup: () => void; onContinue: () => void;
}) {
  const anySecured = securedMethod.stored || securedMethod.downloaded || securedMethod.cold;

  return (
    <motion.div {...animProps}>
      {stepLabel('Step 4 of 4')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Secure your recovery phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Choose at least one way to make sure you never lose access to this wallet.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 18, background: 'var(--bg-2)', border: `1px solid ${securedMethod.stored ? 'var(--green)' : 'var(--border)'}`, borderRadius: 14, transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} style={{ color: 'var(--gold)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Store it, encrypted, on this device</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 12 }}>
            Locked with the wallet password you just created. You can unlock it later on this browser by entering that password again.
          </p>
          <button onClick={onStoreEncrypted} disabled={securedMethod.stored} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: securedMethod.stored ? 'var(--green)' : 'var(--txt)', fontSize: 13, fontWeight: 700, cursor: securedMethod.stored ? 'default' : 'pointer' }}>
            {securedMethod.stored ? <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> : null}
            {securedMethod.stored ? 'Stored ✓' : 'Encrypt & store'}
          </button>
        </div>

        <div style={{ padding: 18, background: 'var(--bg-2)', border: `1px solid ${securedMethod.downloaded ? 'var(--green)' : 'var(--border)'}`, borderRadius: 14, transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={20} style={{ color: 'var(--blue)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Download a backup file</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.5, marginBottom: 12 }}>
            Save a plain-text copy to this device or a USB drive. Anyone with this file can access your funds — keep it private.
          </p>
          <button onClick={onDownloadBackup} disabled={securedMethod.downloaded} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: securedMethod.downloaded ? 'var(--green)' : 'var(--txt)', fontSize: 13, fontWeight: 700, cursor: securedMethod.downloaded ? 'default' : 'pointer' }}>
            {securedMethod.downloaded ? <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> : null}
            {securedMethod.downloaded ? 'Downloaded ✓' : 'Download .txt'}
          </button>
        </div>

        <div style={{ padding: 18, background: 'var(--bg-2)', border: `1px solid ${securedMethod.cold ? 'var(--green)' : 'var(--border)'}`, borderRadius: 14, transition: 'border-color 0.2s' }}>
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
            <input type="checkbox" checked={securedMethod.cold} onChange={(e) => setSecuredMethod({ ...securedMethod, cold: e.target.checked })} style={{ marginTop: 2, accentColor: 'var(--gold)' }} />
            <span>Confirmed — I'm storing this myself, offline.</span>
          </label>
        </div>
      </div>

      {error && errorBox(error)}

      <button onClick={onContinue} disabled={!anySecured} style={{ ...primaryBtn(!anySecured, loading, 'Continue'), marginTop: 16 }}>
        {loading ? 'Creating wallet...' : 'Continue to wallet'}
      </button>
    </motion.div>
  );
}
