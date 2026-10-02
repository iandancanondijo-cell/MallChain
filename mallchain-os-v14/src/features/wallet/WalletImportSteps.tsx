import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from '../../components/ui';
import { Lock, Key, ChevronRight, Copy, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { VaultEntry } from './walletCrypto';

const animProps = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

const backBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--txt-3)',
  cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 24,
  display: 'flex', alignItems: 'center', gap: 6,
};

const errorBox = (msg: string) => (
  <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
    <AlertTriangle size={16} />{msg}
  </div>
);

const stepLabel = (text: string) => (
  <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase' }}>
    {text}
  </div>
);

// ─── ConnectMethod ───────────────────────────────────────────────────────────

export function ConnectMethodStep({
  vaultCount, onSelectRetrieve, onSelectImport, onBack,
}: {
  vaultCount: number; onSelectRetrieve: () => void; onSelectImport: () => void; onBack: () => void;
}) {
  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Connect Wallet')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Choose how to connect</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Retrieve a phrase you saved here before, or import one directly. (Connecting via an external wallet app/hardware device isn't available yet.)
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={onSelectRetrieve} disabled={vaultCount === 0}
          style={{ width: '100%', padding: 18, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14, cursor: vaultCount === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', opacity: vaultCount === 0 ? 0.5 : 1 }}
          onMouseEnter={(e) => vaultCount > 0 && (e.currentTarget.style.borderColor = 'var(--gold)')}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={22} style={{ color: 'var(--gold)' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Use a phrase saved in this browser</div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>
              {vaultCount > 0 ? `Unlock ${vaultCount} wallet${vaultCount > 1 ? 's' : ''} stored here` : 'No wallets stored yet'}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--txt-3)' }} />
        </button>

        <button
          onClick={onSelectImport}
          style={{ width: '100%', padding: 18, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s' }}
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
}

// ─── ConnectRetrieve ─────────────────────────────────────────────────────────

export function ConnectRetrieveStep({
  vault, error, loading, onUnlock, onContinueWithSeed, onBack, onForgotPassword,
}: {
  vault: VaultEntry[]; error: string; loading: boolean;
  onUnlock: (index: number, password: string) => Promise<string | null>;
  onContinueWithSeed: (seedWords: string[]) => void;
  onBack: () => void; onForgotPassword: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [password, setPassword] = useState('');
  const [retrievedSeed, setRetrievedSeed] = useState<string[] | null>(null);

  const handleUnlock = async () => {
    const phrase = await onUnlock(selectedIndex, password);
    if (phrase) setRetrievedSeed(phrase.split(' '));
  };

  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Step 2 of 2')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Retrieve a saved phrase</h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        Choose the wallet you stored on this device, then enter the password you locked it with.
      </p>

      {vault.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--txt-3)', fontSize: 13 }}>
          No recovery phrase has been stored in this browser yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {vault.map((entry, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-2)', border: `1px solid ${selectedIndex === i ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer' }}>
                <input type="radio" name="walletPick" checked={selectedIndex === i} onChange={() => setSelectedIndex(i)} style={{ accentColor: 'var(--gold)' }} />
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
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>Wallet password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
              style={{ width: '100%', padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--txt)', fontSize: 14 }}
            />
            <button type="button" onClick={onForgotPassword} style={{ background: 'transparent', border: 'none', color: 'var(--txt-3)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 8, padding: 0, textDecoration: 'underline' }}>
              Forgot your password?
            </button>
          </div>

          <button onClick={handleUnlock} disabled={loading} style={{ width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12, color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, marginBottom: 20 }}>
            {loading ? 'Unlocking...' : 'Unlock phrase'}
          </button>

          {retrievedSeed && (
            <>
              <div style={{ padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {retrievedSeed.map((word, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--txt-3)', fontSize: 11, width: 20 }}>{i + 1}.</span>
                      <span style={{ fontWeight: 600 }}>{word}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => onContinueWithSeed(retrievedSeed)} disabled={loading} style={{ width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12, color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Restoring wallet...' : 'Continue to wallet'}
              </button>
            </>
          )}
        </>
      )}

      {error && errorBox(error)}
    </motion.div>
  );
}

// ─── ConnectImport ───────────────────────────────────────────────────────────

export function ConnectImportStep({
  passwordResetMode, error, loading, onImport, onPaste, onBack,
}: {
  passwordResetMode: boolean; error: string; loading: boolean;
  onImport: (phrase: string, password: string) => void;
  onPaste: () => Promise<string>;
  onBack: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');

  const handlePaste = async () => {
    const text = await onPaste();
    setPhrase(text);
  };

  return (
    <motion.div {...animProps}>
      <button onClick={onBack} style={backBtn}><ArrowLeft size={16} />Back</button>
      {stepLabel('Step 2 of 2')}
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {passwordResetMode ? 'Reset your password' : 'Enter your recovery phrase'}
      </h1>
      <p style={{ color: 'var(--txt-3)', fontSize: 14, marginBottom: 24 }}>
        {passwordResetMode
          ? "We can't recover a forgotten device password — it's not stored anywhere, by design. Re-enter the same recovery phrase below to prove it's your wallet, then choose a new password. This replaces the old locked entry for that wallet."
          : 'Type or paste it below, separated by single spaces, exactly as it was given to you.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
            Recovery phrase <span style={{ color: 'var(--txt-3)', fontWeight: 400 }}>12, 15, 18, 21, or 24 words</span>
          </label>
          <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="e.g. orbit gravel maple lantern ..."
            style={{ width: '100%', minHeight: 100, padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--txt)', fontSize: 14, fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical' }}
          />
        </div>

        <button onClick={handlePaste} style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Copy size={16} />Paste from clipboard
        </button>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>New password for this device</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"
            style={{ width: '100%', padding: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--txt)', fontSize: 14 }}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />{error}
          </div>
        )}

        <button onClick={() => onImport(phrase, password)} disabled={loading} style={{ width: '100%', padding: 14, background: 'var(--gold)', border: 'none', borderRadius: 12, color: 'var(--gold-ink)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Importing wallet...' : 'Import wallet'}
        </button>
      </div>
    </motion.div>
  );
}
