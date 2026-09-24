/**
 * Landing Page — Mallchain OS v14
 * Goal-oriented: leads with what a visitor can actually go *do* (buy MLCNS
 * with M-Pesa, earn Mallpoints from campaigns, launch a campaign, trade,
 * stake, validate) instead of generic "future of finance" positioning.
 * Visual language: dark canvas, warm gold glow accents, floating pill nav,
 * bento-style feature grid, alternating spotlight sections, FAQ accordion.
 * Fully responsive, mobile-first design with dark theme.
 */

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Smartphone,
  Megaphone,
  ShoppingBag,
  Lock,
  ShieldCheck,
  ArrowRight,
  Menu,
  X,
  ChevronDown,
  Landmark,
  Gavel,
  BarChart3,
  Unlock,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { economyApi, type EconomyState } from '../services/economyApi';
import '../styles/landing.css';

interface LandingProps {
  navigate: (path: string) => void;
}

interface Goal {
  Icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  featured?: boolean;
}

const GOALS: Goal[] = [
  {
    Icon: Smartphone,
    title: 'Buy Mallcoin with M-Pesa',
    body: 'Pay with M-Pesa and receive MLCNS in your wallet in minutes — no exchange account, no card required.',
    cta: 'Buy Mallcoin',
    featured: true,
  },
  {
    Icon: Megaphone,
    title: 'Earn by promoting content',
    body: 'Complete verified campaigns on TikTok, Instagram, YouTube, and more. 1 MLPTS = KSh 2, convertible to Mallcoin on your eligibility window.',
    cta: 'Start earning',
  },
  {
    Icon: BarChart3,
    title: 'Launch your own campaign',
    body: 'Bring a content link and a budget in Mallpoints — the network verifies real engagement through staked reviewers before anyone gets paid.',
    cta: 'Launch a campaign',
  },
  {
    Icon: ShoppingBag,
    title: 'Trade on the marketplace',
    body: 'Buy, sell, and discover goods and services priced in Mallcoin, backed by real on-chain liquidity.',
    cta: 'Explore the marketplace',
  },
  {
    Icon: Lock,
    title: 'Stake and shape the network',
    body: 'Lock Mallcoin to earn staking rewards, then vote on the governance proposals that decide how the network evolves.',
    cta: 'Start staking',
  },
  {
    Icon: ShieldCheck,
    title: 'Run a validator',
    body: 'Secure the chain, process transactions, and earn validator rewards for keeping the network honest.',
    cta: 'Become a validator',
  },
];

const FAQS = [
  {
    q: 'Do I need a seed phrase to get started?',
    a: 'No. Your wallet is created automatically when you sign up, so you can start immediately. You can back up your seed phrase any time from wallet settings.',
  },
  {
    q: 'How do I buy Mallcoin?',
    a: 'Buy MLCNS directly with M-Pesa from your wallet — funds land in minutes, with no exchange account or card required.',
  },
  {
    q: "What's the difference between Mallpoints and Mallcoin?",
    a: 'Mallpoints (MLPTS) are earned by completing verified campaigns and are worth KSh 2 each. You can convert MLPTS into Mallcoin (MLCNS) during your eligibility window.',
  },
  {
    q: 'Who checks that a campaign was actually completed?',
    a: "Staked, reputation-weighted reviewers verify real engagement on-chain before any Mallpoints leave the campaign's budget.",
  },
  {
    q: "Is Mallcoin's price fixed?",
    a: "No — Mallcoin's buy/sell price is set on-chain from real network activity and capped by actual liquidity, not adjusted off-chain by decree.",
  },
];

export default function Landing({ navigate }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [economy, setEconomy] = useState<EconomyState | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  // Scroll animation refs for each major section
  // Hero is always visible since it's at the top of the page
  const [heroRef, heroVisible] = useScrollAnimation(0.1);
  const [goalsRef, goalsVisible] = useScrollAnimation(0.1);
  const [howRef, howVisible] = useScrollAnimation(0.1);
  const [trustRef, trustVisible] = useScrollAnimation(0.1);
  const [liquidityRef, liquidityVisible] = useScrollAnimation(0.1);
  const [faqRef, faqVisible] = useScrollAnimation(0.1);
  const [ctaRef, ctaVisible] = useScrollAnimation(0.1);

  const goTo = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  // Fetch live economy/price data on mount
  useEffect(() => {
    let cancelled = false;
    economyApi.getState().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setEconomy(res.data);
      }
      setPriceLoading(false);
    }).catch(() => {
      if (!cancelled) setPriceLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Derived live values for the mock dashboard card
  const mlcnsPriceKes = economy?.mlcnsPriceKes ?? 0;
  const pointPriceKes = economy?.pointPriceKes ?? 0;
  const buyPrice = economy?.market?.buyPriceKes ?? 0;
  const sellPrice = economy?.market?.sellPriceKes ?? 0;
  const midPrice = economy?.market?.midPriceKes ?? 0;
  const spreadPercent = buyPrice > 0 && sellPrice > 0
    ? (((buyPrice - sellPrice) / ((buyPrice + sellPrice) / 2)) * 100)
    : 0;
  const priceDirection = buyPrice >= sellPrice;
  const sampleMlcns = 100;
  const sampleKesValue = mlcnsPriceKes * sampleMlcns;
  const samplePoints = 500;
  const samplePointsKes = pointPriceKes * samplePoints;

  return (
    <div className="landing-page">
      {/* ========== NAV ========== */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="nav-logo" onClick={() => goTo('/landing')}>
            <span className="nav-logo-mark"><img src="/favicon.svg" alt="" width={32} height={32} /></span>
            <span className="nav-logo-text">Mallchain</span>
          </div>

          <nav className="nav-links">
            <a href="#goals">What you can do</a>
            <a href="#how-it-works">How it works</a>
            <a href="#trust">Security</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="nav-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('/auth?mode=login')}>
              Login
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => goTo('/auth?mode=signup')}>
              Get Started
            </button>
          </div>

          <button
            className="nav-menu-toggle"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="nav-mobile-menu">
            <a href="#goals" onClick={() => setMenuOpen(false)}>What you can do</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#trust" onClick={() => setMenuOpen(false)}>Security</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            <div className="nav-mobile-actions">
              <button className="btn btn-ghost" onClick={() => goTo('/auth?mode=login')}>
                Login
              </button>
              <button className="btn btn-primary" onClick={() => goTo('/auth?mode=signup')}>
                Get Started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ========== HERO SECTION ========== */}
      <section className="hero-section" ref={heroRef as React.RefObject<HTMLElement>}>
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Live: instant M-Pesa to MLCNS
          </div>

          <h1 className="hero-headline">Buy it. Earn it. Trade it. Grow it.</h1>
          <p className="hero-subheadline">
            Mallchain is one wallet for everything Mallcoin: buy MLCNS with M-Pesa, earn Mallpoints
            by promoting real content, trade on the marketplace, and stake or validate to shape the network.
          </p>

          <div className="hero-buttons">
            <button
              className="btn btn-primary hero-btn"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Get Started <ArrowRight size={16} />
            </button>
            <button
              className="btn btn-ghost hero-btn"
              onClick={() => navigate('/auth?mode=login')}
            >
              Login
            </button>
          </div>

          <div className="hero-visual">
            <div className="hero-visual-arc" aria-hidden="true" />
            <div className="mock-dashboard">
              <div className="mock-dashboard-header">
                <span className="mock-dot mock-dot-red" />
                <span className="mock-dot mock-dot-yellow" />
                <span className="mock-dot mock-dot-green" />
                <span className="mock-dashboard-title">Mallchain Wallet</span>
              </div>
              <div className="mock-dashboard-body">
                <div className="mock-stat-row">
                  <div className="mock-stat">
                    <span className="mock-stat-label">MLCNS Price</span>
                    {priceLoading ? (
                      <span className="mock-stat-value mock-stat-loading">Loading…</span>
                    ) : (
                      <>
                        <span className="mock-stat-value">
                          KSh {mlcnsPriceKes > 0 ? mlcnsPriceKes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </span>
                        <span className={`mock-stat-change ${priceDirection ? 'mock-up' : 'mock-down'}`}>
                          {priceDirection ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {spreadPercent > 0 ? `${spreadPercent.toFixed(1)}% spread` : 'Live'}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mock-stat">
                    <span className="mock-stat-label">Mallpoints Value</span>
                    {priceLoading ? (
                      <span className="mock-stat-value mock-stat-loading">Loading…</span>
                    ) : (
                      <>
                        <span className="mock-stat-value">
                          KSh {pointPriceKes > 0 ? pointPriceKes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </span>
                        <span className="mock-stat-change">
                          per MLPTS
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="mock-stat-row mock-stat-row-sub">
                  <div className="mock-stat-sub">
                    <span className="mock-stat-sub-label">Sample: {sampleMlcns} MLCNS</span>
                    <span className="mock-stat-sub-value">≈ KSh {sampleKesValue > 0 ? sampleKesValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
                  </div>
                  <div className="mock-stat-sub">
                    <span className="mock-stat-sub-label">Sample: {samplePoints} MLPTS</span>
                    <span className="mock-stat-sub-value">≈ KSh {samplePointsKes > 0 ? samplePointsKes.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
                  </div>
                </div>
                <div className="mock-chart">
                  <div className="mock-bar" style={{ height: '35%' }} />
                  <div className="mock-bar" style={{ height: '55%' }} />
                  <div className="mock-bar" style={{ height: '40%' }} />
                  <div className="mock-bar" style={{ height: '70%' }} />
                  <div className="mock-bar" style={{ height: '52%' }} />
                  <div className="mock-bar" style={{ height: '85%' }} />
                  <div className="mock-bar mock-bar-active" style={{ height: '100%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== TRUST STRIP ========== */}
      <div className="trust-strip">
        <span className="trust-strip-label">Powered by</span>
        <div className="trust-strip-items">
          <span>Cosmos SDK</span>
          <span>CometBFT</span>
          <span>M-Pesa</span>
          <span>On-chain liquidity</span>
        </div>
      </div>

      {/* ========== GOAL-ORIENTED BENTO GRID ========== */}
      <section className="features-section" id="goals" ref={goalsRef as React.RefObject<HTMLElement>}>
        <div className={`section-head ${goalsVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          <h2>What do you want to do?</h2>
          <p>Pick a goal below — every path starts with the same wallet</p>
        </div>

        <div className={`features-grid scroll-stagger ${goalsVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          {GOALS.map(({ Icon, title, body, cta, featured }) => (
            <div
              key={title}
              className={`feature-card card-hover${featured ? ' feature-card-featured' : ''}`}
            >
              <div className="feature-icon-badge">
                <Icon size={22} />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <button
                className="btn btn-ghost btn-sm feature-cta"
                onClick={() => navigate('/auth?mode=signup')}
              >
                {cta} <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="how-it-works-section" id="how-it-works" ref={howRef as React.RefObject<HTMLElement>}>
        <div className={`section-head ${howVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          <h2>How It Works</h2>
          <p>From zero to your first Mallcoin</p>
        </div>

        <div className={`steps-flow scroll-stagger ${howVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          <div className="step-item">
            <div className="step-number">1</div>
            <h3>Create your wallet</h3>
            <p>Sign up in minutes — your wallet is created automatically, no seed phrase to manage up front.</p>
          </div>

          <div className="flow-arrow">
            <svg viewBox="0 0 40 40" className="arrow-svg">
              <path d="M 10 20 L 30 20 M 25 15 L 30 20 L 25 25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <h3>Fund it your way</h3>
            <p>Buy Mallcoin with M-Pesa, or earn Mallpoints by completing verified social campaigns — no cash needed.</p>
          </div>

          <div className="flow-arrow">
            <svg viewBox="0 0 40 40" className="arrow-svg">
              <path d="M 10 20 L 30 20 M 25 15 L 30 20 L 25 25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <h3>Trade, stake, or convert</h3>
            <p>Use the marketplace, stake for rewards, vote in governance, or convert Mallpoints into Mallcoin — all from one wallet.</p>
          </div>
        </div>
      </section>

      {/* ========== SPOTLIGHT A: VERIFIED PAYOUTS ========== */}
      <section className="spotlight-section" id="trust" ref={trustRef as React.RefObject<HTMLElement>}>
        <div className="spotlight-grid">
          <div className={`spotlight-copy ${trustVisible ? 'scroll-visible' : 'scroll-animate'}`}>
            <span className="spotlight-eyebrow">Payout integrity</span>
            <h2>Every campaign is checked before anyone gets paid</h2>
            <p>
              Staked, reputation-weighted reviewers verify real engagement on-chain before a single
              Mallpoint leaves a campaign's budget — so payouts reflect real activity, not bots.
            </p>
            <ul className="spotlight-checklist">
              <li><Gavel size={16} /> Reviewers stake Mallcoin to vouch for their verdicts</li>
              <li><ShieldCheck size={16} /> Fake or low-effort engagement is rejected before payout</li>
              <li><BarChart3 size={16} /> Reviewer reputation is tracked and weighted on-chain</li>
            </ul>
            <button className="btn btn-ghost" onClick={() => navigate('/auth?mode=signup')}>
              See how reviews work <ArrowRight size={16} />
            </button>
          </div>

          <div className={`spotlight-visual ${trustVisible ? 'scroll-visible' : 'scroll-animate'}`}>
            <div className="spotlight-glow" aria-hidden="true" />
            <div className="mock-card">
              <div className="mock-card-row">
                <span className="mock-card-label">Campaign #4821</span>
                <span className="mock-pill mock-pill-pending">Under review</span>
              </div>
              <div className="mock-card-divider" />
              <div className="mock-reviewer-row">
                <span className="mock-avatar" />
                <div className="mock-reviewer-info">
                  <span className="mock-reviewer-name">Reviewer stake: 420 MLCNS</span>
                  <span className="mock-reviewer-sub">Reputation: 98.2%</span>
                </div>
                <span className="mock-pill mock-pill-approved">Approved</span>
              </div>
              <div className="mock-reviewer-row">
                <span className="mock-avatar" />
                <div className="mock-reviewer-info">
                  <span className="mock-reviewer-name">Reviewer stake: 260 MLCNS</span>
                  <span className="mock-reviewer-sub">Reputation: 95.7%</span>
                </div>
                <span className="mock-pill mock-pill-approved">Approved</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SPOTLIGHT B: LIQUIDITY-BACKED PRICE ========== */}
      <section className="spotlight-section spotlight-reverse" ref={liquidityRef as React.RefObject<HTMLElement>}>
        <div className="spotlight-grid">
          <div className={`spotlight-visual ${liquidityVisible ? 'scroll-visible' : 'scroll-animate'}`}>
            <div className="spotlight-glow" aria-hidden="true" />
            <div className="mock-card">
              <div className="mock-card-row">
                <span className="mock-card-label">MLCNS / KSh</span>
                <span className="mock-pill mock-pill-approved">On-chain</span>
              </div>
              <div className="mock-price-chart">
                <svg viewBox="0 0 240 80" preserveAspectRatio="none">
                  <polyline
                    points="0,60 30,52 60,58 90,40 120,44 150,26 180,32 210,14 240,20"
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
              <div className="mock-card-divider" />
              <div className="mock-card-row">
                <span className="mock-reviewer-sub">Available liquidity</span>
                <span className="mock-reviewer-name">82,410 MLCNS</span>
              </div>
            </div>
          </div>

          <div className={`spotlight-copy ${liquidityVisible ? 'scroll-visible' : 'scroll-animate'}`}>
            <span className="spotlight-eyebrow">Backed by real liquidity</span>
            <h2>Your funds, capped by liquidity, not a promise</h2>
            <p>
              MLCNS purchases and sales draw from real on-chain liquidity pools. Mallcoin's price
              moves with actual network activity — it isn't adjusted off-chain by decree.
            </p>
            <ul className="spotlight-checklist">
              <li><Landmark size={16} /> Buy/sell price is set on-chain from live activity</li>
              <li><Unlock size={16} /> Built on the Cosmos SDK — open, widely-used infrastructure</li>
              <li><Wallet size={16} /> Withdraw or convert whenever your eligibility window opens</li>
            </ul>
            <button className="btn btn-ghost" onClick={() => navigate('/auth?mode=signup')}>
              Explore liquidity pools <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="faq-section" id="faq" ref={faqRef as React.RefObject<HTMLElement>}>
        <div className={`section-head ${faqVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          <h2>Frequently Asked Questions</h2>
          <p>Straight answers about wallets, payouts, and pricing</p>
        </div>

        <div className={`faq-list scroll-stagger ${faqVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          {FAQS.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={item.q} className={`faq-item${isOpen ? ' faq-item-open' : ''}`}>
                <button
                  className="faq-question"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="faq-chevron" />
                </button>
                {isOpen && <p className="faq-answer">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ========== CTA FOOTER SECTION ========== */}
      <section className="cta-footer-section" ref={ctaRef as React.RefObject<HTMLElement>}>
        <div className="cta-glow" aria-hidden="true" />
        <div className={`cta-content ${ctaVisible ? 'scroll-visible' : 'scroll-animate'}`}>
          <h2>Ready to pick your first goal?</h2>
          <p>Create your wallet, then buy Mallcoin, earn Mallpoints, or head straight to the marketplace.</p>

          <div className="cta-buttons">
            <button
              className="btn btn-primary btn-large"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Create Your Account
            </button>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="landing-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="nav-logo">
              <span className="nav-logo-mark"><img src="/favicon.svg" alt="" width={32} height={32} /></span>
              <span className="nav-logo-text">Mallchain</span>
            </div>
            <p>One wallet for buying, earning, trading, staking, and validating Mallcoin.</p>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">Product</span>
            <a href="#goals">Buy Mallcoin</a>
            <a href="#goals">Marketplace</a>
            <a href="#goals">Staking</a>
            <a href="#goals">Validators</a>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">Learn</span>
            <a href="#how-it-works">How it works</a>
            <a href="#trust">Security</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">Account</span>
            <a onClick={() => navigate('/auth?mode=signup')}>Get Started</a>
            <a onClick={() => navigate('/auth?mode=login')}>Login</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Mallchain. Built on the Cosmos SDK.</span>
        </div>
      </footer>
    </div>
  );
}
