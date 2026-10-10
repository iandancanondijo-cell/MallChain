import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, Shield, Upload, Camera, FileText } from 'lucide-react';
import { useState, useRef } from 'react';
import './KycWizard.css';

type KycStep = 'inactive' | 'create' | 'verify' | 'personal' | 'address' | 'identity' | 'selfie' | 'review' | 'done';

export type KycData = {
  email: string;
  password: string;
  confirmPassword: string;
  referralCode: string;
  otp: string;
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
  selfieUrl: string;
  occupation: string;
  sourceOfFunds: string;
  annualIncome: string;
  politicalExposure: boolean;
  acceptTerms: boolean;
  confirmAge: boolean;
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
  { title: 'Create account', icon: '1' },
  { title: 'Verify email', icon: '2' },
  { title: 'About you', icon: '3' },
  { title: 'Address & Contact', icon: '4' },
  { title: 'ID document', icon: '5' },
  { title: 'Selfie', icon: '6' },
  { title: 'Review', icon: '7' }
];

const ID_TYPES = [
  { value: 'national_id', label: 'National ID card' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's licence" }
];

const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Nigeria', 'Ghana', 'South Africa', 'United Kingdom', 'United States', 'Other'];

export function KycWizard({ stepIndex, data, setData, error, onNext, onBack, onSubmit, busy }: KycWizardProps) {
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string>('');
  const [idBackPreview, setIdBackPreview] = useState<string>('');
  const [selfiePreview, setSelfiePreview] = useState<string>('');
  const idFrontInputRef = useRef<HTMLInputElement>(null);
  const idBackInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | null, type: 'idFront' | 'idBack' | 'selfie') => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      alert('Please upload a JPG, PNG, or PDF file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be under 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === 'idFront') {
        setIdFrontFile(file);
        setIdFrontPreview(result);
      } else if (type === 'idBack') {
        setIdBackFile(file);
        setIdBackPreview(result);
      } else {
        setSelfieFile(file);
        setSelfiePreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderFileUpload = (type: 'idFront' | 'idBack' | 'selfie', label: string, preview: string, isSelfie = false) => {
    const inputRef = type === 'idFront' ? idFrontInputRef : type === 'idBack' ? idBackInputRef : selfieInputRef;
    return (
      <div className="kyc-upload-field">
        <label className="kyc-upload-label">{label}</label>
        <label className={`kyc-drop-zone ${preview ? 'has-file' : ''}`}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            capture={isSelfie ? 'user' : undefined}
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null, type)}
            style={{ display: 'none' }}
          />
          <div className={`kyc-upload-frame ${isSelfie ? 'selfie' : ''}`}>
            {preview ? (
              preview.includes('application/pdf') ? (
                <span><b>PDF added</b>{idFrontFile?.name || idBackFile?.name || selfieFile?.name}</span>
              ) : (
                <img src={preview} alt={`${label} preview`} />
              )
            ) : (
              <span>
                <b>{isSelfie ? 'Take a selfie or choose a photo' : 'Choose a file or take a photo'}</b>
                {isSelfie ? 'JPG or PNG, up to 5 MB' : 'Drop it here'}
              </span>
            )}
          </div>
        </label>
        {preview && (
          <p className="kyc-file-name">
            {(idFrontFile || idBackFile || selfieFile)?.name} · {((idFrontFile || idBackFile || selfieFile)?.size || 0 / 1024).toFixed(0)} KB · select again to replace
          </p>
        )}
      </div>
    );
  };

  const renderStepContent = () => {
    // Step 1: Create Account
    if (stepIndex === 1) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Create your account</h2>
          <p className="kyc-step-lead">Start your journey on the decentralized web.</p>
          <div className="kyc-field">
            <label htmlFor="kyc-email">Email address</label>
            <input
              id="kyc-email"
              type="email"
              value={data.email}
              onChange={(e) => setData({ email: e.target.value })}
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-pass">Password</label>
            <input
              id="kyc-pass"
              type="password"
              data-lpignore="true"
              data-form-type="guard"
              value={data.password}
              onChange={(e) => setData({ password: e.target.value })}
              autoComplete="new-password"
              placeholder="Min 8 characters"
            />
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-confirm">Confirm password</label>
            <input
              id="kyc-confirm"
              type="password"
              data-lpignore="true"
              data-form-type="guard"
              value={data.confirmPassword}
              onChange={(e) => setData({ confirmPassword: e.target.value })}
              autoComplete="new-password"
              placeholder="Repeat your password"
            />
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-ref">Referral code (optional)</label>
            <input
              id="kyc-ref"
              type="text"
              value={data.referralCode}
              onChange={(e) => setData({ referralCode: e.target.value })}
              autoComplete="off"
              placeholder="MALL-XXXXXXXX"
            />
          </div>
          <label className="kyc-checkbox">
            <input
              type="checkbox"
              checked={data.confirmAge}
              onChange={(e) => setData({ confirmAge: e.target.checked })}
            />
            <span>I confirm I am at least 18 years old</span>
          </label>
          <label className="kyc-checkbox">
            <input
              type="checkbox"
              checked={data.acceptTerms}
              onChange={(e) => setData({ acceptTerms: e.target.checked })}
            />
            <span>I agree to the Terms of Service and Privacy Policy</span>
          </label>
        </div>
      );
    }

    // Step 2: Verify Email
    if (stepIndex === 2) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Verify your email</h2>
          <p className="kyc-step-lead">We sent a 6-digit code to <strong>{data.email}</strong>. Enter it below to confirm your email address.</p>
          <div className="kyc-field">
            <label htmlFor="kyc-otp">Verification code</label>
            <input
              id="kyc-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={data.otp}
              onChange={(e) => setData({ otp: e.target.value })}
              placeholder="000000"
              maxLength={6}
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }}
            />
          </div>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', textAlign: 'center' }}>
            Didn't receive a code? <button type="button" className="kyc-edit-btn" style={{ display: 'inline' }}>Resend</button>
          </p>
        </div>
      );
    }

    // Step 3: About you
    if (stepIndex === 3) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Tell us about you</h2>
          <p className="kyc-step-lead">Enter your details exactly as they appear on your ID.</p>
          <div className="kyc-form-row">
            <div className="kyc-field">
              <label htmlFor="kyc-first">First name</label>
              <input
                id="kyc-first"
                type="text"
                value={data.firstName}
                onChange={(e) => setData({ firstName: e.target.value })}
                autoComplete="given-name"
                placeholder="John"
              />
            </div>
            <div className="kyc-field">
              <label htmlFor="kyc-last">Last name</label>
              <input
                id="kyc-last"
                type="text"
                value={data.lastName}
                onChange={(e) => setData({ lastName: e.target.value })}
                autoComplete="family-name"
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="kyc-form-row">
            <div className="kyc-field">
              <label htmlFor="kyc-dob">Date of birth</label>
              <input
                id="kyc-dob"
                type="date"
                data-lpignore="true"
                data-form-type="guard"
                value={data.dateOfBirth}
                onChange={(e) => setData({ dateOfBirth: e.target.value })}
                autoComplete="bday"
              />
            </div>
            <div className="kyc-field">
              <label htmlFor="kyc-phone">Phone number</label>
              <input
                id="kyc-phone"
                type="tel"
                data-lpignore="true"
                data-form-type="guard"
                value={data.phoneNumber}
                onChange={(e) => setData({ phoneNumber: e.target.value })}
                autoComplete="tel"
                placeholder="+254 700 000000"
              />
            </div>
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-nat">Nationality</label>
            <select
              id="kyc-nat"
              value={data.nationality}
              onChange={(e) => setData({ nationality: e.target.value })}
            >
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-addr">Residential address</label>
            <input
              id="kyc-addr"
              type="text"
              value={data.address}
              onChange={(e) => setData({ address: e.target.value })}
              autoComplete="street-address"
              placeholder="123 Main Street"
            />
          </div>
          <div className="kyc-form-row">
            <div className="kyc-field">
              <label htmlFor="kyc-city">City or town</label>
              <input
                id="kyc-city"
                type="text"
                value={data.city}
                onChange={(e) => setData({ city: e.target.value })}
                autoComplete="address-level2"
                placeholder="Nairobi"
              />
            </div>
            <div className="kyc-field">
              <label htmlFor="kyc-res">Country of residence</label>
              <select
                id="kyc-res"
                value={data.country}
                onChange={(e) => setData({ country: e.target.value })}
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }

    // Step 4: Address & Contact
    if (stepIndex === 4) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Address & Contact</h2>
          <p className="kyc-step-lead">Confirm your contact details.</p>
          <div className="kyc-field">
            <label htmlFor="kyc-address2">Street Address</label>
            <input
              id="kyc-address2"
              type="text"
              value={data.address}
              onChange={(e) => setData({ address: e.target.value })}
              autoComplete="address-line1"
              placeholder="123 Main Street"
            />
          </div>
          <div className="kyc-form-row">
            <div className="kyc-field">
              <label htmlFor="kyc-city2">City</label>
              <input
                id="kyc-city2"
                type="text"
                value={data.city}
                onChange={(e) => setData({ city: e.target.value })}
                autoComplete="address-level2"
                placeholder="Nairobi"
              />
            </div>
            <div className="kyc-field">
              <label htmlFor="kyc-postal">Postal Code</label>
              <input
                id="kyc-postal"
                type="text"
                value={data.postalCode}
                onChange={(e) => setData({ postalCode: e.target.value })}
                autoComplete="postal-code"
                placeholder="00100"
              />
            </div>
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-country2">Country</label>
            <select
              id="kyc-country2"
              value={data.country}
              onChange={(e) => setData({ country: e.target.value })}
            >
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="kyc-field">
            <label htmlFor="kyc-phone2">Phone Number</label>
            <input
              id="kyc-phone2"
              type="tel"
              value={data.phoneNumber}
              onChange={(e) => setData({ phoneNumber: e.target.value })}
              autoComplete="tel"
              placeholder="+254 700 000000"
            />
          </div>
        </div>
      );
    }

    // Step 5: Identity Verification
    if (stepIndex === 5) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Upload your ID</h2>
          <p className="kyc-step-lead">Choose a government-issued document. It must be valid and not expired.</p>
          <div className="kyc-id-types">
            {ID_TYPES.map((type) => (
              <label key={type.value} className={`kyc-id-type ${data.idType === type.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="idType"
                  value={type.value}
                  checked={data.idType === type.value}
                  onChange={(e) => setData({ idType: e.target.value })}
                  style={{ display: 'none' }}
                />
                {type.label}
              </label>
            ))}
          </div>
          <div className="kyc-form-row">
            <div className="kyc-field">
              <label htmlFor="kyc-idnum">Document number</label>
              <input
                id="kyc-idnum"
                type="text"
                data-lpignore="true"
                data-form-type="guard"
                value={data.idNumber}
                onChange={(e) => setData({ idNumber: e.target.value })}
                autoComplete="off"
                placeholder="AB123456"
              />
            </div>
            <div className="kyc-field">
              <label htmlFor="kyc-idexp">Expiry date</label>
              <input
                id="kyc-idexp"
                type="date"
                value={data.idExpiry}
                onChange={(e) => setData({ idExpiry: e.target.value })}
              />
            </div>
          </div>
          <ul className="kyc-tips">
            <li>All four corners visible and text readable</li>
            <li>No glare, blur or cropped edges</li>
            <li>JPG, PNG or PDF, up to 5 MB</li>
          </ul>
          {renderFileUpload('idFront', data.idType === 'passport' ? 'Photo page of passport' : 'Front of ID', idFrontPreview)}
          {data.idType !== 'passport' && renderFileUpload('idBack', 'Back of ID', idBackPreview)}
        </div>
      );
    }

    // Step 6: Selfie
    if (stepIndex === 6) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Take a selfie</h2>
          <p className="kyc-step-lead">We compare your face with the photo on your ID to confirm it's you.</p>
          <ul className="kyc-tips">
            <li>Face the camera in good light</li>
            <li>Remove glasses, hats and masks</li>
            <li>Use a plain background if you can</li>
          </ul>
          {renderFileUpload('selfie', 'Selfie photo', selfiePreview, true)}
        </div>
      );
    }

    // Step 7: Review
    if (stepIndex === 7) {
      return (
        <div className="kyc-step-content">
          <h2 className="kyc-step-title">Review and submit</h2>
          <p className="kyc-step-lead">Check everything before you send it. You can't edit after submitting.</p>
          <dl className="kyc-summary">
            <div className="kyc-sum-row">
              <dt>Name</dt>
              <dd>{data.firstName} {data.lastName}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            <div className="kyc-sum-row">
              <dt>Date of birth</dt>
              <dd>{data.dateOfBirth}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            <div className="kyc-sum-row">
              <dt>Phone</dt>
              <dd>{data.phoneNumber}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            <div className="kyc-sum-row">
              <dt>Nationality</dt>
              <dd>{data.nationality}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            <div className="kyc-sum-row">
              <dt>Address</dt>
              <dd>{data.address}, {data.city}, {data.country}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            <div className="kyc-sum-row">
              <dt>Document</dt>
              <dd>{ID_TYPES.find(t => t.value === data.idType)?.label} · {data.idNumber} · expires {data.idExpiry}</dd>
              <button type="button" className="kyc-edit-btn" onClick={onBack}>Edit</button>
            </div>
            {idFrontPreview && (
              <div className="kyc-sum-row">
                <dt>ID images</dt>
                <dd className="kyc-thumbs">
                  {idFrontPreview.includes('application/pdf') ? (
                    <span className="kyc-thumb-pdf">PDF</span>
                  ) : (
                    <img src={idFrontPreview} alt="ID front" className="kyc-thumb-img" />
                  )}
                  {idBackPreview && !idBackPreview.includes('application/pdf') && (
                    <img src={idBackPreview} alt="ID back" className="kyc-thumb-img" />
                  )}
                </dd>
                <span></span>
              </div>
            )}
            {selfiePreview && (
              <div className="kyc-sum-row">
                <dt>Selfie</dt>
                <dd className="kyc-thumbs">
                  <img src={selfiePreview} alt="Selfie" className="kyc-thumb-img" />
                </dd>
                <span></span>
              </div>
            )}
          </dl>
          <label className="kyc-checkbox">
            <input
              type="checkbox"
              checked={data.acceptTerms}
              onChange={(e) => setData({ acceptTerms: e.target.checked })}
            />
            <span>I confirm these details are accurate and I consent to my identity documents being checked for verification.</span>
          </label>
        </div>
      );
    }

    return null;
  };

  const isLastStep = stepIndex === 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="kyc-wizard"
    >
      {/* Sidebar stepper */}
      <aside className="kyc-sidebar">
        <div className="kyc-logo">Mallchain</div>
        <p>Verifying your identity takes about five minutes. You will need a valid government ID and a camera or photo of yourself.</p>
        <ol className="kyc-steps">
          {STEPS.map((step, i) => {
            const isCompleted = i + 1 < stepIndex;
            const isCurrent = i + 1 === stepIndex;
            return (
              <li key={i} className={isCurrent ? 'on' : isCompleted ? 'done' : ''}>
                <span className="kyc-step-dot">{isCompleted || stepIndex > 7 ? '✓' : step.icon}</span>
                <span>{step.title}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Main content */}
      <main className="kyc-main">
        <div className="kyc-panel">
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="kyc-error"
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
            {renderStepContent()}
          </motion.div>

          {/* Navigation */}
          <div className="kyc-nav">
            {stepIndex > 1 && (
              <button
                onClick={onBack}
                disabled={busy}
                className="kyc-btn kyc-btn-ghost"
              >
                Back
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={onNext}
                disabled={busy}
                className="kyc-btn kyc-btn-primary"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={busy || !data.acceptTerms}
                className="kyc-btn kyc-btn-primary"
                style={{ opacity: busy || !data.acceptTerms ? 0.5 : 1 }}
              >
                {busy ? 'Submitting...' : 'Submit for review'}
              </button>
            )}
          </div>
        </div>
      </main>
    </motion.div>
  );
}
