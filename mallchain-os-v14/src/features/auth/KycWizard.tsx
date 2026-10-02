import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, Shield, User, MapPin, FileText, CreditCard, Calendar } from 'lucide-react';

type KycStep = 'inactive' | 'personal' | 'address' | 'identity' | 'financial' | 'review';

export type KycData = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  phoneNumber: string;
  idType: string;
  idNumber: string;
  idExpiry: string;
  idDocumentUrl: string;
  occupation: string;
  sourceOfFunds: string;
  annualIncome: string;
  politicalExposure: boolean;
  acceptTerms: boolean;
};

interface KycWizardProps {
  stepIndex: number;
  data: KycData;
  setData: (data: Partial<KycData>) => void;
  error: string;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  busy: boolean;
}

const STEPS = [
  { title: 'Personal Information', icon: User },
  { title: 'Address & Contact', icon: MapPin },
  { title: 'Identity Verification', icon: FileText },
  { title: 'Financial Information', icon: CreditCard },
  { title: 'AML Review', icon: Shield }
];

export function KycWizard({ stepIndex, data, setData, error, onNext, onBack, onSubmit, busy }: KycWizardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      style={{ 
        maxWidth: 600, 
        margin: '0 auto', 
        padding: '40px 20px'
      }}
    >
      {/* Progress Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16
        }}>
          <Shield size={24} style={{ color: 'var(--gold)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            KYC & AML Verification
          </h1>
        </div>
        <p style={{ 
          textAlign: 'center', 
          color: 'var(--txt-3)', 
          fontSize: 14,
          marginBottom: 24
        }}>
          Complete verification to unlock full platform access
        </p>
        
        {/* Progress Steps */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const isActive = i + 1 === stepIndex;
            const isCompleted = i + 1 < stepIndex;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: isCompleted ? 'var(--green)' : isActive ? 'var(--gold)' : 'var(--bg-2)',
                  border: `1px solid ${isActive ? 'var(--gold)' : 'var(--border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isCompleted ? 'var(--gold-ink)' : isActive ? 'var(--gold-ink)' : 'var(--txt-3)',
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  {isCompleted ? <Check size={16} /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ 
                    flex: 1, 
                    height: 2, 
                    background: isCompleted ? 'var(--green)' : 'var(--border-soft)' 
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              color: 'var(--red)',
              fontSize: 13,
              padding: 12,
              marginBottom: 20,
              background: 'var(--red-dim)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step Content */}
      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {stepIndex === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Personal Information
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label htmlFor="kyc-first-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  First Name
                </label>
                <input
                  id="kyc-first-name"
                  type="text"
                  value={data.firstName}
                  onChange={(e) => setData({ firstName: e.target.value })}
                  placeholder="John"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
              <div>
                <label htmlFor="kyc-last-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Last Name
                </label>
                <input
                  id="kyc-last-name"
                  type="text"
                  value={data.lastName}
                  onChange={(e) => setData({ lastName: e.target.value })}
                  placeholder="Doe"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="kyc-dob" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Date of Birth
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar size={18} aria-hidden="true" style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--txt-3)'
                }} />
                <input
                  id="kyc-dob"
                  type="date"
                  value={data.dateOfBirth}
                  onChange={(e) => setData({ dateOfBirth: e.target.value })}
                  autoComplete="bday"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 44px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="kyc-nationality" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Nationality
              </label>
              <input
                id="kyc-nationality"
                type="text"
                value={data.nationality}
                onChange={(e) => setData({ nationality: e.target.value })}
                placeholder="United States"
                autoComplete="off"
                autoCapitalize="words"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>
          </div>
        )}

        {stepIndex === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Address & Contact
            </h2>

            <div>
              <label htmlFor="kyc-address" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Street Address
              </label>
              <input
                id="kyc-address"
                type="text"
                value={data.address}
                onChange={(e) => setData({ address: e.target.value })}
                placeholder="123 Main Street"
                autoComplete="address-line1"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label htmlFor="kyc-city" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  City
                </label>
                <input
                  id="kyc-city"
                  type="text"
                  value={data.city}
                  onChange={(e) => setData({ city: e.target.value })}
                  placeholder="New York"
                  autoComplete="address-level2"
                  autoCapitalize="words"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
              <div>
                <label htmlFor="kyc-postal-code" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                  Postal Code
                </label>
                <input
                  id="kyc-postal-code"
                  type="text"
                  value={data.postalCode}
                  onChange={(e) => setData({ postalCode: e.target.value })}
                  placeholder="10001"
                  autoComplete="postal-code"
                  inputMode="text"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--txt)',
                    fontSize: 14
                  }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="kyc-country" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Country
              </label>
              <input
                id="kyc-country"
                type="text"
                value={data.country}
                onChange={(e) => setData({ country: e.target.value })}
                placeholder="United States"
                autoComplete="country-name"
                autoCapitalize="words"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label htmlFor="kyc-phone" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Phone Number
              </label>
              <input
                id="kyc-phone"
                type="tel"
                value={data.phoneNumber}
                onChange={(e) => setData({ phoneNumber: e.target.value })}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>
          </div>
        )}

        {stepIndex === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Identity Verification
            </h2>

            <div>
              <label htmlFor="kyc-id-type" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                ID Type
              </label>
              <select
                id="kyc-id-type"
                value={data.idType}
                onChange={(e) => setData({ idType: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              >
                <option value="">Select ID type</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="national_id">National ID</option>
              </select>
            </div>

            <div>
              <label htmlFor="kyc-id-number" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                ID Number
              </label>
              <input
                id="kyc-id-number"
                type="text"
                value={data.idNumber}
                onChange={(e) => setData({ idNumber: e.target.value })}
                placeholder="AB123456"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label htmlFor="kyc-id-expiry" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                ID Expiry Date
              </label>
              <input
                id="kyc-id-expiry"
                type="date"
                value={data.idExpiry}
                onChange={(e) => setData({ idExpiry: e.target.value })}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>
          </div>
        )}

        {stepIndex === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Financial Information
            </h2>

            <div>
              <label htmlFor="kyc-occupation" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Occupation
              </label>
              <input
                id="kyc-occupation"
                type="text"
                value={data.occupation}
                onChange={(e) => setData({ occupation: e.target.value })}
                placeholder="Software Engineer"
                autoComplete="organization-title"
                autoCapitalize="words"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label htmlFor="kyc-source-funds" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Source of Funds
              </label>
              <select
                id="kyc-source-funds"
                value={data.sourceOfFunds}
                onChange={(e) => setData({ sourceOfFunds: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              >
                <option value="">Select source</option>
                <option value="employment">Employment</option>
                <option value="business">Business</option>
                <option value="investments">Investments</option>
                <option value="inheritance">Inheritance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="kyc-annual-income" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--txt-2)' }}>
                Annual Income Range
              </label>
              <select
                id="kyc-annual-income"
                value={data.annualIncome}
                onChange={(e) => setData({ annualIncome: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--txt)',
                  fontSize: 14
                }}
              >
                <option value="">Select range</option>
                <option value="under_25k">Under $25,000</option>
                <option value="25k_50k">$25,000 - $50,000</option>
                <option value="50k_100k">$50,000 - $100,000</option>
                <option value="100k_250k">$100,000 - $250,000</option>
                <option value="over_250k">Over $250,000</option>
              </select>
            </div>
          </div>
        )}

        {stepIndex === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              AML Review & Terms
            </h2>

            <div style={{
              padding: 16,
              background: 'var(--bg-2)',
              borderRadius: 12,
              border: '1px solid var(--border)'
            }}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--txt-2)', marginBottom: 12 }}>
                Please review and confirm the following:
              </p>
              <ul style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--txt-3)', paddingLeft: 20 }}>
                <li>All information provided is accurate and complete</li>
                <li>Funds used on this platform are from legitimate sources</li>
                <li>You are not a politically exposed person (PEP) or will disclose if you are</li>
                <li>You will comply with all applicable laws and regulations</li>
              </ul>
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              background: 'var(--bg-2)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={data.politicalExposure}
                onChange={(e) => setData({ politicalExposure: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.5 }}>
                I am a politically exposed person (PEP) — someone entrusted with a prominent public function, or a family member/close associate of such a person.
              </span>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              background: 'var(--bg-2)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={data.acceptTerms}
                onChange={(e) => setData({ acceptTerms: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.5 }}>
                I accept the terms of service and privacy policy, and consent to KYC/AML verification procedures.
              </span>
            </label>
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 32,
        paddingTop: 24,
        borderTop: '1px solid var(--border)'
      }}>
        {stepIndex > 1 && (
          <button
            onClick={onBack}
            disabled={busy}
            style={{
              flex: 1,
              padding: 14,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--txt)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Back
          </button>
        )}
        {stepIndex < 5 ? (
          <button
            onClick={onNext}
            disabled={busy}
            style={{
              flex: 1,
              padding: 14,
              background: 'var(--gold)',
              border: 'none',
              borderRadius: 10,
              color: 'var(--gold-ink)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={busy || !data.acceptTerms}
            style={{
              flex: 1,
              padding: 14,
              background: 'var(--gold)',
              border: 'none',
              borderRadius: 10,
              color: 'var(--gold-ink)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: busy || !data.acceptTerms ? 0.5 : 1
            }}
          >
            {busy ? 'Submitting...' : 'Submit Verification'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
