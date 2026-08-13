/**
 * PasswordStrength.tsx — Phase 1, Section 2, Task 2.3
 * Real-time password strength meter with requirements
 * Displays: strength level (weak/fair/good/strong), meter bar, and checklist
 */

interface PasswordStrengthProps {
  password: string;
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  // Calculate strength: 0-3 points
  const getStrength = () => {
    let score = 0;
    
    // At least 8 characters
    if (password.length >= 8) score++;
    
    // Has uppercase
    if (/[A-Z]/.test(password)) score++;
    
    // Has number
    if (/\d/.test(password)) score++;
    
    // Has special character
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
    
    return Math.min(score, 3);
  };

  const strength = getStrength();

  const strengthLevels = ['Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['var(--red)', 'var(--gold)', 'var(--cyan)', 'var(--green)'];

  // Requirements
  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Contains number (0-9)', met: /\d/.test(password) },
    { label: 'Contains special character (!@#$...)', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];

  return (
    <div className="password-strength">
      {/* Strength Label & Value */}
      <div className="strength-label">
        <span>Password Strength</span>
        <span className={`strength-value level-${strength}`}>
          {strengthLevels[strength]}
        </span>
      </div>

      {/* Meter Bar */}
      <div className="strength-meter">
        <div className={`strength-meter-fill level-${strength}`} />
      </div>

      {/* Requirements Checklist */}
      <div className="strength-requirements">
        {requirements.map((req, i) => (
          <div key={i} className={`strength-requirement ${req.met ? 'met' : ''}`}>
            <span className="check" />
            <span>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
