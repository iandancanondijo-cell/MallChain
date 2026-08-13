/**
 * MnemonicDisplay.tsx — Phase 1, Section 2, Task 2.8-2.9
 * Displays 12-word mnemonic in 3x4 grid with word numbers
 * Includes copy-all functionality and screenshot protection warning
 */

interface MnemonicDisplayProps {
  mnemonic: string;
  onCopyAll?: () => void;
}

export default function MnemonicDisplay({ mnemonic, onCopyAll }: MnemonicDisplayProps) {
  const words = mnemonic.split(' ').filter(w => w);

  const handleCopy = (word: string) => {
    navigator.clipboard.writeText(word);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 3x4 Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
      }}>
        {words.map((word, i) => (
          <div
            key={i}
            onClick={() => handleCopy(word)}
            style={{
              padding: '12px 10px',
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--gold)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(243, 186, 47, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line-1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            title="Click to copy"
          >
            <div style={{ fontSize: 10, color: 'var(--txt-3)', marginBottom: 4, fontWeight: 600 }}>
              {i + 1}.
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)', fontFamily: 'monospace' }}>
              {word}
            </div>
          </div>
        ))}
      </div>

      {/* Copy All Button */}
      {onCopyAll && (
        <button
          className="btn btn-ghost"
          onClick={onCopyAll}
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          📋 Copy All Words
        </button>
      )}

      {/* Screenshot Warning */}
      <div style={{
        padding: 10,
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 6,
        fontSize: 11,
        color: 'var(--txt-2)',
        lineHeight: 1.5,
        textAlign: 'center',
      }}>
        ⚠️ <strong>Don't screenshot this.</strong> Write it down or use a password manager.
      </div>
    </div>
  );
}
