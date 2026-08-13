/**
 * Mallchain Mission Control v14 — Numpad Component
 * Phase 1, Section 3: Login Flow UI (Tasks 3.5, 3.6)
 * 
 * Features:
 * - 3.6: 3x3 grid layout with keys 1-9
 * - 3.6: 0 key (centered below grid)
 * - 3.6: Backspace key for digit deletion
 * - 3.6: Confirm button for PIN submission
 * - Keyboard support (1-9, 0, Backspace, Enter)
 * - Touch-friendly tap targets
 * - Accessibility: ARIA labels, keyboard navigation
 */

import { useEffect, useRef } from 'react';
import '../styles/numpad.css';

interface NumpadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength?: number;
}

export default function Numpad({ 
  value, 
  onChange, 
  onSubmit, 
  disabled = false,
  maxLength = 6 
}: NumpadProps) {
  const numpadRef = useRef<HTMLDivElement>(null);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      // Numbers 1-9 and 0
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if (value.length < maxLength) {
          onChange(value + e.key);
        }
        return;
      }

      // Backspace
      if (e.key === 'Backspace') {
        e.preventDefault();
        onChange(value.slice(0, -1));
        return;
      }

      // Enter to submit
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, onChange, onSubmit, disabled, maxLength]);

  const handleDigitClick = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="numpad" ref={numpadRef}>
      {/* 3x3 grid: 1-9 */}
      <div className="numpad-grid">
        {/* Row 1: 1, 2, 3 */}
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('1')}
          disabled={disabled || value.length >= maxLength}
          aria-label="1"
          title="Press 1"
        >
          1
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('2')}
          disabled={disabled || value.length >= maxLength}
          aria-label="2"
          title="Press 2"
        >
          2
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('3')}
          disabled={disabled || value.length >= maxLength}
          aria-label="3"
          title="Press 3"
        >
          3
        </button>

        {/* Row 2: 4, 5, 6 */}
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('4')}
          disabled={disabled || value.length >= maxLength}
          aria-label="4"
          title="Press 4"
        >
          4
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('5')}
          disabled={disabled || value.length >= maxLength}
          aria-label="5"
          title="Press 5"
        >
          5
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('6')}
          disabled={disabled || value.length >= maxLength}
          aria-label="6"
          title="Press 6"
        >
          6
        </button>

        {/* Row 3: 7, 8, 9 */}
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('7')}
          disabled={disabled || value.length >= maxLength}
          aria-label="7"
          title="Press 7"
        >
          7
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('8')}
          disabled={disabled || value.length >= maxLength}
          aria-label="8"
          title="Press 8"
        >
          8
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('9')}
          disabled={disabled || value.length >= maxLength}
          aria-label="9"
          title="Press 9"
        >
          9
        </button>

        {/* Row 4: Backspace, 0, Spacer */}
        <button
          className="numpad-key numpad-backspace"
          onClick={handleBackspace}
          disabled={disabled || value.length === 0}
          aria-label="Backspace"
          title="Press Backspace or Delete"
        >
          ⌫
        </button>
        <button
          className="numpad-key numpad-digit"
          onClick={() => handleDigitClick('0')}
          disabled={disabled || value.length >= maxLength}
          aria-label="0"
          title="Press 0"
        >
          0
        </button>
        <button
          className="numpad-key numpad-confirm"
          onClick={onSubmit}
          disabled={disabled || value.length !== maxLength}
          aria-label="Confirm PIN"
          title="Press Enter or click to submit"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
