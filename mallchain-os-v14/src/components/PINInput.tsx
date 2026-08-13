/**
 * PINInput.tsx — Phase 1, Section 2, Task 2.12
 * Masked PIN entry component with dots instead of digits
 * Copy-paste disabled, digits-only input, 4-8 digit constraint
 */

interface PINInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  maxLength?: number;
}

export default function PINInput({
  value,
  onChange,
  error = false,
  maxLength = 8,
}: PINInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Only allow digits
    val = val.replace(/\D/g, '');
    // Limit to maxLength
    val = val.slice(0, maxLength);
    onChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent copy/paste
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Hidden input for actual value */}
      <input
        type="password"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        maxLength={maxLength}
        placeholder="••••"
        className={`input${error ? ' err' : ''}`}
        style={{
          fontFamily: 'monospace',
          fontSize: 24,
          letterSpacing: '12px',
          textAlign: 'center',
          paddingRight: 60,
        }}
      />

      {/* Length indicator */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 11,
          color: 'var(--txt-3)',
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {value.length} / {maxLength}
      </div>
    </div>
  );
}
