/**
 * PIN Entry Component (Enhanced)
 * Phase 3 Section 10: PIN Entry & Verification - Tasks 10.1-10.7
 * 
 * Features:
 * - Masked dots for visual feedback
 * - Copy-paste blocking for security
 * - Keyboard input support (numbers + backspace + enter)
 * - Timeout auto-clear (30 seconds)
 * - Visual numpad for mobile
 * - Attempt counter display
 * - Accessibility compliant
 */

import React, { useEffect, useRef } from 'react';
import '../styles/pin-entry.css';

interface PINEntryProps {
  length?: number; // 4-8 digits (default 4)
  value: string;
  onChange: (value: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  attempts?: number;
  maxAttempts?: number;
  showNumpad?: boolean;
  autoTimeoutMs?: number; // Default 30000 (30 seconds)
}

export function PINEntry({
  length = 4,
  value,
  onChange,
  onComplete,
  disabled = false,
  attempts = 0,
  maxAttempts = 3,
  showNumpad = false,
  autoTimeoutMs = 30000,
}: PINEntryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Task 10.4: Timeout auto-clear (30 sec default)
  useEffect(() => {
    if (value.length > 0 && autoTimeoutMs > 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        onChange('');
      }, autoTimeoutMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, onChange, autoTimeoutMs]);

  // Task 10.3: Keyboard input support
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || attempts >= maxAttempts) return;

    // Backspace: remove last digit
    if (e.key === 'Backspace') {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }

    // Numbers: add digit
    if (/^\d$/.test(e.key)) {
      if (value.length < length) {
        const newValue = value + e.key;
        onChange(newValue);

        // Task 10.1: Auto-trigger complete on full PIN
        if (newValue.length === length && onComplete) {
          setTimeout(() => onComplete(newValue), 100);
        }
      }
      e.preventDefault();
      return;
    }

    // Enter: submit PIN
    if (e.key === 'Enter' && value.length === length && onComplete) {
      e.preventDefault();
      onComplete(value);
    }
  };

  // Task 10.2: Copy-paste blocking
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\D/g, '').slice(0, length);
    onChange(newValue);
  };

  // Generate visual representation (dots)
  const dots = '•'.repeat(value.length);
  const placeholders = '○'.repeat(length - value.length);

  const isLocked = attempts >= maxAttempts;

  return (
    <div className={`pin-entry-wrapper ${isLocked ? 'locked' : ''}`}>
      {/* PIN Input Field */}
      <div className="pin-input-container">
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={length}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isLocked}
          className="pin-input-hidden"
          aria-label="PIN input"
          autoComplete="off"
        />

        {/* Visual PIN Display */}
        <div
          className="pin-display"
          onClick={() => !isLocked && inputRef.current?.focus()}
        >
          {dots}
          {placeholders}
        </div>
      </div>

      {/* Attempt Counter */}
      {maxAttempts > 0 && (
        <div className={`attempt-counter ${attempts > 0 ? 'warning' : ''}`}>
          Attempts remaining: {maxAttempts - attempts}/{maxAttempts}
        </div>
      )}

      {/* Numpad for Mobile/Touchscreen */}
      {showNumpad && (
        <PINNumpad
          value={value}
          onChange={onChange}
          maxLength={length}
          disabled={disabled || isLocked}
          onComplete={onComplete}
        />
      )}

      {/* Status Message */}
      {isLocked && (
        <div className="pin-locked-message">
          ⚠️ Too many failed attempts. Please try again later.
        </div>
      )}

      {value.length > 0 && !isLocked && (
        <div className="pin-status">
          {value.length}/{length} digits entered
        </div>
      )}
    </div>
  );
}

/**
 * PIN Numpad Component (Task 10.5-10.7)
 * Visual 3x3 + 0 grid for mobile PIN entry
 */
interface PINNumpadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
  onComplete?: (pin: string) => void;
}

export function PINNumpad({
  value,
  onChange,
  maxLength,
  disabled = false,
  onComplete,
}: PINNumpadProps) {
  const handleDigitClick = (digit: number) => {
    if (disabled || value.length >= maxLength) return;

    const newValue = value + digit.toString();
    onChange(newValue);

    // Auto-complete on full PIN
    if (newValue.length === maxLength && onComplete) {
      setTimeout(() => onComplete(newValue), 100);
    }
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const handleConfirm = () => {
    if (disabled || value.length !== maxLength || !onComplete) return;
    onComplete(value);
  };

  const canInput = !disabled && value.length < maxLength;

  return (
    <div className="pin-numpad">
      <div className="numpad-grid">
        {/* Rows 1-3: Digits 1-9 */}
        {Array.from({ length: 9 }, (_, i) => i + 1).map(digit => (
          <button
            key={digit}
            className="numpad-btn numpad-digit"
            onClick={() => handleDigitClick(digit)}
            disabled={!canInput}
            type="button"
            aria-label={`Enter ${digit}`}
          >
            {digit}
          </button>
        ))}

        {/* Row 4: 0 and Backspace */}
        <button
          className="numpad-btn numpad-zero"
          onClick={() => handleDigitClick(0)}
          disabled={!canInput}
          type="button"
          aria-label="Enter 0"
        >
          0
        </button>

        <button
          className="numpad-btn numpad-backspace"
          onClick={handleBackspace}
          disabled={disabled || value.length === 0}
          type="button"
          title="Delete"
          aria-label="Backspace"
        >
          ⌫
        </button>
      </div>

      {/* Confirm Button (shown when PIN complete) */}
      {value.length === maxLength && (
        <button
          className="numpad-confirm"
          onClick={handleConfirm}
          disabled={disabled}
          type="button"
        >
          Confirm PIN
        </button>
      )}
    </div>
  );
}

export default PINEntry;
