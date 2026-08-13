/**
 * BiometricSetup.tsx — Phase 1, Section 2, Task 2.14
 * Toggle component for biometric authentication setup
 * Detects browser support and displays appropriate description
 */

import { useState, useEffect } from 'react';
import { authService } from '../services/auth';

interface BiometricSetupProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function BiometricSetup({ enabled, onChange }: BiometricSetupProps) {
  const [available, setAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Face ID / Fingerprint');

  useEffect(() => {
    const checkBiometric = async () => {
      const isAvailable = await authService.isBiometricAvailable();
      if (isAvailable) {
        setAvailable(true);
        // Detect type (Face ID vs Fingerprint)
        // This is a simplified detection; in production use WebAuthn API
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
          setBiometricType('Face ID');
        } else if (userAgent.includes('android')) {
          setBiometricType('Fingerprint');
        }
      }
    };
    checkBiometric();
  }, []);

  if (!available) {
    return (
      <div style={{
        padding: 12,
        background: 'rgba(148, 163, 189, 0.08)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--txt-2)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>ℹ Biometric Not Available</div>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          Your device or browser doesn't support biometric authentication. You can still secure your wallet with a PIN.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        marginBottom: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-1)' }}>
            Enable {biometricType}
          </div>
          <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>
            Faster authentication for transactions
          </div>
        </div>
        <label className="check" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      </div>

      {enabled && (
        <div style={{
          padding: 10,
          background: 'rgba(34, 211, 238, 0.08)',
          borderRadius: 6,
          border: '1px solid rgba(34, 211, 238, 0.2)',
          fontSize: 11,
          color: 'var(--txt-2)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--cyan)' }}>✓ {biometricType} enabled</strong>
          <div style={{ marginTop: 4 }}>
            You'll use {biometricType.toLowerCase()} to authorize transactions. Your biometric data never leaves your device.
          </div>
        </div>
      )}

      {!enabled && available && (
        <div style={{
          padding: 10,
          background: 'rgba(148, 163, 189, 0.08)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--txt-2)',
          lineHeight: 1.5,
        }}>
          You can enable {biometricType.toLowerCase()} at any time in security settings.
        </div>
      )}
    </div>
  );
}
