/**
 * PINInput.tsx — Phase 1, Section 2, Task 2.12
 * Masked PIN entry component with dots instead of digits
 * Copy-paste disabled, digits-only input, 4-8 digit constraint
 * Fixed: Prevents focus jumping, works in incognito, autofocus on mount
 */
import { useEffect, useRef } from 'react';

interface PINInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}

export default function PINInput({
  value,
  onChange,
  error = false,
  maxLength = 8,
  autoFocus = true,
}: PINInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input field when component mounts
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Only allow digits
    val = val.replace(/\D/g, '');
    // Limit to maxLength
    val = val.slice(0, maxLength);
    onChange(val);
    
    // Keep focus on input field after change (prevent jumping)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent copy/paste
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
      e.preventDefault();
    }
    // Tab should be allowed for keyboard navigation, but keep focus on input while typing
    if (e.key === 'Tab') {
      return; // Allow natural tab navigation
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  // Prevent autofill memory issues in incognito mode
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Clear any browser autocomplete suggestions
    e.currentTarget.setAttribute('autocomplete', 'off');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Hidden input for actual value */}
      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={handleFocus}
        maxLength={maxLength}
        placeholder="••••"
        className={`input${error ? ' err' : ''}`}
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
        style={{
          fontFamily: 'monospace',
          fontSize: 24,
          letterSpacing: '12px',
          textAlign: 'center',
          paddingRight: 60,
        }}
        aria-label="PIN entry"
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
