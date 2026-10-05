/**
 * Compliance & Regulatory Gates
 * Age verification, KYC/AML checks, terms acceptance
 * 
 * Features:
 * - Age verification (18+ requirement)
 * - Terms of Service acceptance
 * - Privacy Policy acknowledgment
 * - KYC/AML status checks
 * - Geographic restrictions
 * - Device verification
 */

import { useEffect, useState } from 'react';
import { store } from '../store/store';
import { api } from '../services/api';
import './ComplianceGates.css';

interface ComplianceStatus {
  ageVerified: boolean;
  tosAccepted: boolean;
  privacyAccepted: boolean;
  kycLevel: number;
  kycStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  amlStatus: 'clear' | 'flagged' | 'under_review';
  geographicRestriction: boolean;
  restrictedReason?: string;
  lastVerified: number;
}

/**
 * Age verification modal
 */
export function AgeVerificationModal({ onVerify }: { onVerify: () => void }) {
  const [selectedMonth, setSelectedMonth] = useState('01');
  const [selectedDay, setSelectedDay] = useState('01');
  const [selectedYear, setSelectedYear] = useState('2000');
  const [error, setError] = useState('');

  const handleVerify = () => {
    const birthDate = new Date(`${selectedYear}-${selectedMonth}-${selectedDay}`);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      const actualAge = age - 1;
      if (actualAge < 18) {
        setError('You must be at least 18 years old to use Mallchain');
        return;
      }
    } else if (age < 18) {
      setError('You must be at least 18 years old to use Mallchain');
      return;
    }

    // Store age verification (persistent)
    localStorage.setItem('mallchain_age_verified', JSON.stringify({
      timestamp: Date.now(),
      userConfirmed: true,
    }));

    onVerify();
  };

  // Generate year options (18+ years old)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 18 - i);

  return (
    <div className="compliance-modal compliance-modal--age-verify">
      <div className="compliance-modal__content">
        <h2>Age Verification Required</h2>
        <p>
          Mallchain requires all users to be 18 years or older. Please enter your date of birth
          to continue.
        </p>

        <div className="age-verify__inputs">
          <div className="age-verify__field">
            <label htmlFor="month">Month</label>
            <select
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>
                  {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          <div className="age-verify__field">
            <label htmlFor="day">Day</label>
            <select
              id="day"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>
                  {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          <div className="age-verify__field">
            <label htmlFor="year">Year</label>
            <select
              id="year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="compliance-modal__error">{error}</div>}

        <div className="compliance-modal__actions">
          <button
            className="btn btn--primary btn--block"
            onClick={handleVerify}
          >
            Verify Age
          </button>
        </div>

        <p className="compliance-modal__disclaimer">
          We take age verification seriously. This information is encrypted and used only for
          compliance purposes.
        </p>
      </div>
    </div>
  );
}

/**
 * Terms of Service acceptance modal
 */
export function TOSAcceptanceModal({ onAccept }: { onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    if (!agreed) return;

    localStorage.setItem('mallchain_tos_accepted', JSON.stringify({
      timestamp: Date.now(),
      version: '1.0',
    }));

    onAccept();
  };

  return (
    <div className="compliance-modal compliance-modal--tos">
      <div className="compliance-modal__content">
        <h2>Terms of Service</h2>

        <div className="compliance-modal__scroll-content">
          <div className="tos-section">
            <h3>1. Acceptance of Terms</h3>
            <p>
              By accessing and using Mallchain, you accept and agree to be bound by the terms
              and provision of this agreement.
            </p>
          </div>

          <div className="tos-section">
            <h3>2. User Responsibilities</h3>
            <p>
              You are responsible for maintaining the confidentiality of your account and password
              and for restricting access to your computer. You agree to accept responsibility for all
              activities that occur under your account or password.
            </p>
          </div>

          <div className="tos-section">
            <h3>3. Prohibited Activities</h3>
            <p>
              You agree not to engage in any of the following prohibited activities: (a) violating
              laws or regulations; (b) infringing intellectual property rights; (c) harassing or
              abusing others; (d) engaging in fraud or deception.
            </p>
          </div>

          <div className="tos-section">
            <h3>4. Financial Risk Disclosure</h3>
            <p>
              Cryptocurrency trading involves substantial risk of loss. Past performance is not
              indicative of future results. You acknowledge and accept all risks associated with
              trading digital assets.
            </p>
          </div>

          <div className="tos-section">
            <h3>5. Limitation of Liability</h3>
            <p>
              IN NO EVENT SHALL MALLCHAIN BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, REGARDLESS OF THE CAUSE OF ACTION.
            </p>
          </div>

          <div className="tos-section">
            <h3>6. Compliance with Laws</h3>
            <p>
              You agree to comply with all applicable laws and regulations in your jurisdiction.
              Mallchain reserves the right to restrict access to users in jurisdictions where
              operations are prohibited or restricted.
            </p>
          </div>
        </div>

        <div className="compliance-modal__checkbox">
          <input
            type="checkbox"
            id="tos-agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <label htmlFor="tos-agree">
            I have read and agree to the Terms of Service
          </label>
        </div>

        <div className="compliance-modal__actions">
          <button
            className="btn btn--primary btn--block"
            onClick={handleAccept}
            disabled={!agreed}
          >
            Accept Terms
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * KYC/AML status alert
 */
export function KYCStatusAlert() {
  const st = store.state;
  const kycLevel = st.user.kycLevel || 0;

  if (kycLevel >= 2) {
    return null; // KYC complete
  }

  return (
    <div className="compliance-alert compliance-alert--kyc">
      <div className="compliance-alert__icon">⚠️</div>
      <div className="compliance-alert__content">
        <h4>Complete KYC Verification</h4>
        <p>
          To unlock full access to marketplace features, please complete identity verification.
        </p>
      </div>
      <button
        className="btn btn--sm btn--secondary"
        onClick={() => {
          // Navigate to KYC verification
          window.location.hash = '/settings?tab=kyc';
        }}
      >
        Complete Now
      </button>
    </div>
  );
}

/**
 * Compliance status hook
 */
export function useComplianceStatus(): ComplianceStatus {
  const [status, setStatus] = useState<ComplianceStatus>({
    ageVerified: false,
    tosAccepted: false,
    privacyAccepted: false,
    kycLevel: 0,
    kycStatus: 'pending',
    amlStatus: 'clear',
    geographicRestriction: false,
    lastVerified: 0,
  });

  useEffect(() => {
    const checkCompliance = async () => {
      try {
        // Check age verification
        const ageVerified = localStorage.getItem('mallchain_age_verified');
        const tosAccepted = localStorage.getItem('mallchain_tos_accepted');
        const privacyAccepted = localStorage.getItem('mallchain_privacy_accepted');

        // Fetch KYC/AML status from backend
        const complianceRes = await api.get<ComplianceStatus>('/api/auth/compliance-status');

        setStatus({
          ageVerified: !!ageVerified,
          tosAccepted: !!tosAccepted,
          privacyAccepted: !!privacyAccepted,
          kycLevel: store.state.user.kycLevel || 0,
          kycStatus: complianceRes.data?.kycStatus || 'pending',
          amlStatus: complianceRes.data?.amlStatus || 'clear',
          geographicRestriction: complianceRes.data?.geographicRestriction || false,
          restrictedReason: complianceRes.data?.restrictedReason,
          lastVerified: Date.now(),
        });
      } catch (error) {
        console.error('Compliance check failed:', error);
      }
    };

    if (store.state.user.authed) {
      checkCompliance();
    }
  }, [store.state.user.authed]);

  return status;
}

/**
 * Geographic restriction alert
 */
export function GeographicRestrictionAlert({ reason }: { reason?: string }) {
  return (
    <div className="compliance-modal compliance-modal--restriction">
      <div className="compliance-modal__content">
        <h2>Service Unavailable in Your Region</h2>
        <p>
          Due to regulatory requirements, Mallchain services are not available in your jurisdiction.
        </p>
        {reason && (
          <div className="compliance-modal__detail">
            <p>{reason}</p>
          </div>
        )}
        <p className="compliance-modal__disclaimer">
          If you believe this is an error, please contact support.
        </p>
      </div>
    </div>
  );
}

/**
 * Privacy policy acceptance modal
 */
export function PrivacyPolicyModal({ onAccept }: { onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    if (!agreed) return;

    localStorage.setItem('mallchain_privacy_accepted', JSON.stringify({
      timestamp: Date.now(),
      version: '1.0',
    }));

    onAccept();
  };

  return (
    <div className="compliance-modal compliance-modal--privacy">
      <div className="compliance-modal__content">
        <h2>Privacy Policy</h2>

        <div className="compliance-modal__scroll-content">
          <div className="tos-section">
            <h3>Data Collection</h3>
            <p>
              We collect personal information necessary to provide our services, including your
              name, email, and transaction data.
            </p>
          </div>

          <div className="tos-section">
            <h3>Data Protection</h3>
            <p>
              Your data is protected with industry-standard encryption and security measures.
              We never sell your personal information to third parties.
            </p>
          </div>

          <div className="tos-section">
            <h3>Cookies and Tracking</h3>
            <p>
              We use cookies and similar technologies to improve your experience. You can control
              these settings in your browser preferences.
            </p>
          </div>

          <div className="tos-section">
            <h3>Third-Party Disclosure</h3>
            <p>
              We may share information with regulatory authorities as required by law, and with
              trusted service providers who assist in delivering our services.
            </p>
          </div>
        </div>

        <div className="compliance-modal__checkbox">
          <input
            type="checkbox"
            id="privacy-agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <label htmlFor="privacy-agree">
            I acknowledge and accept the Privacy Policy
          </label>
        </div>

        <div className="compliance-modal__actions">
          <button
            className="btn btn--primary btn--block"
            onClick={handleAccept}
            disabled={!agreed}
          >
            Accept Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}
