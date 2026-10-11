/**
 * KYC Gate - Blocks all features until KYC verification is completed
 *
 * When user has kycLevel === 1 (unverified), shows a blocking modal
 * that prevents access to any features until they complete KYC verification.
 *
 * Status-aware: before blocking, the gate checks the real KYC status so it
 * never blocks a user who has already submitted (status pending/review shows
 * a dismissible notice instead) and never shows for an approved user whose
 * kycLevel has not yet propagated.
 */

import { useEffect, useState } from 'react';
import { kycApi } from '../services/kycApi';
import './KYCGate.css';

export interface KYCGateProps {
  kycLevel: number;
  userId: string;
  onStartKYC: () => void;
}

type GateMode =
  | 'checking'  // status request in flight — render nothing
  | 'action'    // not submitted / draft / rejected / status lookup failed — show the blocking gate
  | 'review'    // submitted, awaiting admin decision — dismissible notice, not blocking
  | 'hide';     // already approved (stale kycLevel) — render nothing

export function KYCGate({ kycLevel, userId, onStartKYC }: KYCGateProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [mode, setMode] = useState<GateMode>('checking');

  useEffect(() => {
    if (kycLevel !== 1) return;
    let cancelled = false;
    kycApi.getStatus().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // Fail open to the blocking gate rather than guessing.
        setMode('action');
        return;
      }
      const s = res.data?.status;
      if (s === 'approved') setMode('hide');
      else if (s === 'pending' || s === 'review') setMode('review');
      else setMode('action');
    });
    return () => { cancelled = true; };
  }, [kycLevel, userId]);

  // Only show gate if KYC not completed
  if (kycLevel !== 1) {
    return null;
  }

  if (mode === 'checking' || mode === 'hide') {
    return null;
  }

  if (isMinimized) {
    return (
      <div className="kyc-gate-minimized" role="status" aria-label={mode === 'review' ? 'KYC verification in review' : 'KYC verification required'}>
        <button
          className="kyc-gate-expand"
          onClick={() => setIsMinimized(false)}
          aria-expanded="false"
        >
          {mode === 'review' ? '⏳ KYC in review' : '📋 KYC Required'}
        </button>
      </div>
    );
  }

  if (mode === 'review') {
    return (
      <div className="kyc-gate-overlay" role="dialog" aria-labelledby="kyc-gate-title">
        <div className="kyc-gate-modal">
          <div className="kyc-gate-header">
            <h2 id="kyc-gate-title">Verification under review</h2>
            <button
              className="kyc-gate-close"
              onClick={() => setIsMinimized(true)}
              aria-label="Dismiss"
              title="Dismiss"
            >
              −
            </button>
          </div>

          <div className="kyc-gate-content">
            <div className="kyc-gate-icon">⏳</div>

            <p className="kyc-gate-message">
              We've received your identity verification and our compliance team is reviewing it.
              No further action is needed from you right now — you'll be notified as soon as a decision is made.
            </p>

            <div className="kyc-gate-privacy">
              <p>
                Reviews usually complete within 1–2 business days. You can keep exploring Mallchain in the meantime.
              </p>
            </div>
          </div>

          <div className="kyc-gate-actions">
            <button
              className="kyc-gate-primary"
              onClick={() => setIsMinimized(true)}
            >
              Got it
            </button>
            <p className="kyc-gate-help">
              Have questions? <a href="#/help">Visit our Help Center</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kyc-gate-overlay" role="dialog" aria-labelledby="kyc-gate-title">
      <div className="kyc-gate-modal">
        <div className="kyc-gate-header">
          <h2 id="kyc-gate-title">Identity Verification Required</h2>
          <button
            className="kyc-gate-close"
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize"
            title="Minimize this modal"
          >
            −
          </button>
        </div>

        <div className="kyc-gate-content">
          <div className="kyc-gate-icon">🔐</div>

          <p className="kyc-gate-message">
            To access all features on Mallchain, you need to complete identity verification (KYC).
          </p>

          <div className="kyc-gate-benefits">
            <p className="kyc-gate-label">Complete KYC to:</p>
            <ul>
              <li>✓ Send and receive MALL tokens</li>
              <li>✓ Trade on the marketplace</li>
              <li>✓ Withdraw funds</li>
              <li>✓ Participate in staking</li>
              <li>✓ Vote on governance</li>
              <li>✓ Access all platform features</li>
            </ul>
          </div>

          <div className="kyc-gate-info">
            <p>
              <strong>What you'll need:</strong><br />
              • A valid government-issued ID (passport, driver's license, or national ID)<br />
              • A photo or scan of that document (PNG, JPG, or PDF, up to 10MB)<br />
              • About 5 minutes of your time
            </p>
          </div>

          <div className="kyc-gate-privacy">
            <p>
              🔒 Your information is encrypted and verified securely. We only collect what's necessary for compliance.
            </p>
          </div>
        </div>

        <div className="kyc-gate-actions">
          <button
            className="kyc-gate-primary"
            onClick={onStartKYC}
          >
            Start Verification Now
          </button>
          <p className="kyc-gate-help">
            Have questions? <a href="#/help">Visit our Help Center</a>
          </p>
        </div>
      </div>
    </div>
  );
}
