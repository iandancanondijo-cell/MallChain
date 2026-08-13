/**
 * Landing Page — Mallchain OS v14
 * Main landing page with hero, features, how-it-works, trust section, and CTA footer.
 * Fully responsive, mobile-first design with dark theme.
 */

import React from 'react';
import '../styles/landing.css';

interface LandingProps {
  navigate: (path: string) => void;
}

export default function Landing({ navigate }: LandingProps) {
  return (
    <div className="landing-page">
      {/* ========== HERO SECTION ========== */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-headline">The Future of Marketplace Finance</h1>
          <p className="hero-subheadline">
            Secure, transparent blockchain-powered marketplace for trading, staking, and governance.
            Earn rewards. Validate transactions. Lead the network.
          </p>

          <div className="hero-value-props">
            <div className="value-prop">
              <span className="icon">⚡</span>
              <span className="text">Lightning Fast</span>
            </div>
            <div className="value-prop">
              <span className="icon">🔒</span>
              <span className="text">Bank-Grade Security</span>
            </div>
            <div className="value-prop">
              <span className="icon">🌍</span>
              <span className="text">Globally Decentralized</span>
            </div>
          </div>

          <div className="hero-buttons">
            <button
              className="btn btn-primary hero-btn"
              onClick={() => navigate('/auth')}
            >
              Get Started
            </button>
            <button
              className="btn btn-ghost hero-btn"
              onClick={() => navigate('/auth')}
            >
              Login
            </button>
          </div>
        </div>
      </section>

      {/* ========== FEATURES SHOWCASE ========== */}
      <section className="features-section">
        <div className="section-head">
          <h2>Why Choose Mallchain</h2>
          <p>Best-in-class features for modern marketplace trading and validation</p>
        </div>

        <div className="features-grid">
          <div className="feature-card card-hover">
            <div className="feature-icon">💰</div>
            <h3>Smart Trading</h3>
            <p>
              Advanced marketplace with real-time order matching, liquidity pools, and
              automated trading strategies. Maximize your returns with minimal effort.
            </p>
          </div>

          <div className="feature-card card-hover">
            <div className="feature-icon">🏆</div>
            <h3>Stake & Earn</h3>
            <p>
              Lock your assets and earn competitive rewards. Join mining campaigns,
              participate in governance, and grow your wealth passively over time.
            </p>
          </div>

          <div className="feature-card card-hover">
            <div className="feature-icon">✓</div>
            <h3>Become a Validator</h3>
            <p>
              Run a validator node and secure the network. Earn premium rewards while
              strengthening network integrity and decentralization worldwide.
            </p>
          </div>

          <div className="feature-card card-hover">
            <div className="feature-icon">📊</div>
            <h3>Real-Time Analytics</h3>
            <p>
              Track your portfolio, monitor network activity, and analyze market trends
              with advanced dashboards and detailed historical reporting.
            </p>
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="how-it-works-section">
        <div className="section-head">
          <h2>How It Works</h2>
          <p>Three simple steps to start earning</p>
        </div>

        <div className="steps-flow">
          <div className="step-item">
            <div className="step-number">1</div>
            <h3>Create Account</h3>
            <p>Sign up securely with email or wallet. Complete KYC verification in minutes.</p>
          </div>

          <div className="flow-arrow">
            <svg viewBox="0 0 40 40" className="arrow-svg">
              <path d="M 10 20 L 30 20 M 25 15 L 30 20 L 25 25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <h3>Deposit & Trade</h3>
            <p>Fund your wallet and start trading instantly. Access mining campaigns and staking pools.</p>
          </div>

          <div className="flow-arrow">
            <svg viewBox="0 0 40 40" className="arrow-svg">
              <path d="M 10 20 L 30 20 M 25 15 L 30 20 L 25 25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <h3>Earn Rewards</h3>
            <p>Accumulate rewards from trading, staking, and validation. Withdraw anytime.</p>
          </div>
        </div>
      </section>

      {/* ========== TRUST & SECURITY ========== */}
      <section className="trust-section">
        <div className="section-head">
          <h2>Trusted by Thousands</h2>
          <p>Enterprise-grade security and compliance</p>
        </div>

        <div className="trust-content">
          <div className="trust-statement">
            <p className="statement-text">
              "Mallchain operates with military-grade encryption, multi-sig wallets, and
              decentralized governance. Your assets are protected by cutting-edge blockchain
              technology and audited smart contracts."
            </p>
          </div>

          <div className="badges-row">
            <div className="badge">
              <span className="badge-icon">🔐</span>
              <span className="badge-text">SOC 2 Type II Certified</span>
            </div>
            <div className="badge">
              <span className="badge-icon">✓</span>
              <span className="badge-text">Smart Contracts Audited</span>
            </div>
            <div className="badge">
              <span className="badge-icon">🌐</span>
              <span className="badge-text">Decentralized Infrastructure</span>
            </div>
            <div className="badge">
              <span className="badge-icon">📜</span>
              <span className="badge-text">Regulatory Compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========== CTA FOOTER SECTION ========== */}
      <section className="cta-footer-section">
        <div className="cta-content">
          <h2>Ready to Start Trading?</h2>
          <p>Join thousands of traders and validators on Mallchain. Secure your future today.</p>

          <div className="cta-buttons">
            <button
              className="btn btn-primary btn-large"
              onClick={() => navigate('/auth')}
            >
              Create Your Account
            </button>
          </div>

          <div className="social-links">
            <span className="social-label">Follow Us</span>
            <div className="social-icons">
              <a href="#" className="social-link" title="Twitter">
                𝕏
              </a>
              <a href="#" className="social-link" title="Discord">
                💬
              </a>
              <a href="#" className="social-link" title="GitHub">
                ⚙️
              </a>
              <a href="#" className="social-link" title="Telegram">
                ✈️
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
