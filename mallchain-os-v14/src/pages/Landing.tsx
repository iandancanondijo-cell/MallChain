import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X } from 'lucide-react';
import { store } from '../store/store';
import { useStoreVersion } from '../components/ui';
import '../styles/landing.css';

interface LandingProps {
  navigate: (path: string) => void;
}

const NS = 'http://www.w3.org/2000/svg';

const IC: Record<string, string[]> = {
  create: [
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
    '<path d="M14 3v11.5a3.5 3.5 0 11-3.5-3.5M14 3c.5 3 2.5 4.5 5 4.5"/>',
    '<path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8"/>',
    '<path d="M5 4l14 16M19 4L5 20"/>',
    '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  ],
  build: [
    '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 10l3 2-3 2M12 15h5"/>',
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10a6 6 0 01-6 6H8"/>',
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    '<path d="M9 7a3 3 0 016 0v1H9zM7 11h10v4a5 5 0 01-10 0zM12 11v9M3 12h4M17 12h4M4 6l3 2M20 6l-3 2M4 20l3-2M20 20l-3-2"/>',
    '<path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3"/>',
  ],
  trade: [
    '<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    '<path d="M3 9l1.5-5h15L21 9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M5 12v8h14v-8M10 20v-5h4v5"/>',
    '<path d="M2 6h11v10H2zM13 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l3.5-7h5L18 16M9.5 9L13 16M8 7h3"/>',
    '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17h5l3-6h4l2 6M13 11l-2-3H8M15 8h3"/>',
    '<circle cx="13" cy="4.5" r="1.6"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M12 7l-3 4 4 2 1 5M9 11l-3 2M6 18l3-5"/>',
    '<circle cx="14" cy="4" r="1.6"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M13 7l-2 4h5l2 4M16 11l3 2M5 18h6l2-5"/>',
    '<path d="M6 8h12v4H6zM12 12v9M9 21h6"/>',
    '<path d="M5 9h10M10 9V5M7 5h6M15 9a3 3 0 013 3v1M18 16c-1 1.5-1.5 2.2-1.5 3a1.5 1.5 0 003 0c0-.8-.5-1.5-1.5-3z"/>',
    '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    '<path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01"/>',
  ],
  study: [
    '<path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2zM12 6v14"/>',
    '<path d="M4 4h12v16H6a2 2 0 01-2-2zM16 8h4v10a2 2 0 01-2 2h-2M7 8h6M7 12h6M7 16h3"/>',
    '<path d="M5 5h14v10H5zM2 19h20l-2-4H4z"/>',
    '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6"/>',
    '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
    '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  ],
  validate: [
    '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8.5 12l2.5 2.5 4.5-5"/>',
    '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="12" cy="13" r="1.4"/><path d="M12 7l-6 9M12 7l6 9M7 18h10M12 7v5"/>',
    '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  ],
};

const PATHS = [
  { title: 'Buy it', body: 'Get MLCNS with M-Pesa. No exchange account and no card needed.', band: 0, color: '#FFC83D' },
  { title: 'Sell it', body: 'Sell MLCNS, or list goods and services on the marketplace.', band: 1, color: '#FF4A3D' },
  { title: 'Build it', body: 'Launch campaigns, run a validator, or build on the open Cosmos SDK.', band: 2, color: '#7d95ff' },
  { title: 'Study it', body: 'Learn how consensus, staking and governance work by taking part.', band: 3, color: '#5CF2C0' },
];

const ROLES = [
  { title: 'Create a campaign', body: 'Bring a content link and a budget in Mallpoints. Reviewers check the engagement.', color: '#FFC83D' },
  { title: 'List on the Mallchain Marketplace', body: 'Offer goods and services on the marketplace for a broader reach, open to every wallet on the network.', color: '#FF4A3D' },
  { title: 'Run a validator', body: 'Process transactions and help the chain reach consensus.', color: '#7d95ff' },
  { title: 'Review engagement', body: 'Stake Mallcoin and verify campaigns on-chain.', color: '#5CF2C0' },
  { title: 'Stake', body: 'Lock Mallcoin to take part in running the network.', color: '#FFC83D' },
  { title: 'Vote', body: 'Decide on governance proposals that shape how the network evolves.', color: '#FF4A3D' },
  { title: 'Build on the stack', body: 'The Cosmos SDK is open. Study it, fork it, make your own chain.', color: '#7d95ff' },
  { title: 'Learn by doing', body: 'Use a live network to see blocks, votes and liquidity first-hand.', color: '#5CF2C0' },
];

const TECH = [
  { title: 'Cosmos SDK', body: 'An open framework for building blockchains. Mallchain is built on it.', color: '#FFC83D' },
  { title: 'CometBFT', body: 'The consensus engine. Validators use it to agree on each new block.', color: '#7d95ff' },
  { title: 'On-chain liquidity', body: 'Trades draw from liquidity pools that live on the chain and can be inspected.', color: '#5CF2C0' },
];

const ICON_SETS: { set: string; label: string }[] = [
  { set: 'create', label: 'Create' },
  { set: 'build', label: 'Build' },
  { set: 'trade', label: 'Buy, sell and deliver' },
  { set: 'study', label: 'Study' },
  { set: 'validate', label: 'Validate' },
];

function CyclingIcon({ setName, reducedMotion }: { setName: string; reducedMotion: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = IC[setName];
    if (!set) return;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'in');
    svg.innerHTML = set[0];
    el.appendChild(svg);

    if (reducedMotion) return;

    const baseDelay = 2300 + ICON_SETS.findIndex((i) => i.set === setName) * 430;
    const id = setInterval(() => {
      const current = el.querySelector('svg');
      if (current) current.setAttribute('class', 'out');
      setTimeout(() => {
        idxRef.current = (idxRef.current + 1) % set.length;
        const next = document.createElementNS(NS, 'svg');
        next.setAttribute('viewBox', '0 0 24 24');
        next.setAttribute('aria-hidden', 'true');
        next.setAttribute('class', 'in');
        next.innerHTML = set[idxRef.current];
        el.replaceChildren(next);
      }, 260);
    }, baseDelay);

    return () => {
      clearInterval(id);
    };
  }, [setName, reducedMotion]);

  return <a ref={ref} className="ico" aria-label={ICON_SETS.find((i) => i.set === setName)?.label} title={ICON_SETS.find((i) => i.set === setName)?.label} />;
}

export default function Landing({ navigate }: LandingProps) {
  useStoreVersion();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeBand, setActiveBand] = useState(-1);

  const ringRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<SVGGElement>(null);
  const bandsRef = useRef<SVGCircleElement[]>([]);
  const scrollLayersRef = useRef<SVGGElement[]>([]);

  const reducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const goTo = useCallback((path: string) => {
    setMenuOpen(false);
    navigate(path);
  }, [navigate]);

  const goSignup = useCallback(() => {
    setMenuOpen(false);
    if (store.state.user.authed) {
      navigate('/');
    } else {
      navigate('/auth?mode=register');
    }
  }, [navigate]);

  const goLogin = useCallback(() => {
    setMenuOpen(false);
    if (store.state.user.authed) {
      navigate('/');
    } else {
      navigate('/auth?mode=login');
    }
  }, [navigate]);

  const goLogout = useCallback(() => {
    setMenuOpen(false);
    // Handle logout if needed
  }, []);

  const handlePathClick = useCallback((band: number) => {
    setActiveBand(band);
    setTimeout(() => setActiveBand(-1), 1600);
    goSignup();
  }, [goSignup]);

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    document.querySelectorAll('.landing-page .rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Ring parallax + pupil pointer tracking
  useEffect(() => {
    if (reducedMotion) return;

    const ring = ringRef.current;
    const pupil = pupilRef.current;
    const scs = scrollLayersRef.current;
    if (!ring || !pupil || scs.length === 0) return;

    let cur = window.scrollY;
    let raf = 0;
    let px = 0;
    let py = 0;
    let vl = 0;

    function updatePupil() {
      pupil!.style.transform = `translate(${px * 16}px, ${py * 16 + vl}px)`;
    }

    function tick() {
      const y = window.scrollY;
      const h = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const p = y / h;
      cur += (y - cur) * 0.07;
      vl = Math.max(-26, Math.min(26, (y - cur) * 0.5));

      scs.forEach((g) => {
        const k = parseFloat(g.dataset.k || '0');
        g.style.transform = `rotate(${(cur * k * 0.1).toFixed(2)}deg)`;
      });

      ring!.style.transform = `translate(-50%, -50%) scale(${(1 + p * 1.6).toFixed(3)})`;
      ring!.style.opacity = Math.max(0.16, 0.62 - p * 1.1).toFixed(2);
      updatePupil();

      raf = Math.abs(y - cur) > 0.2 ? requestAnimationFrame(tick) : 0;
    }

    ring.style.opacity = '0.62';
    ring.style.transform = 'translate(-50%, -50%)';

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onPointer = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
      updatePupil();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  // Band highlighting on path hover
  useEffect(() => {
    const bands = bandsRef.current;
    if (bands.length === 0) return;

    bands.forEach((c, i) => {
      const dim = activeBand < 0 || i === activeBand;
      c.style.opacity = dim ? '1' : '0.1';
    });
  }, [activeBand]);

  const setBandRef = (idx: number) => (el: SVGCircleElement | null) => {
    if (el) bandsRef.current[idx] = el;
  };

  const setScrollRef = (idx: number) => (el: SVGGElement | null) => {
    if (el) scrollLayersRef.current[idx] = el;
  };

  return (
    <div className="landing-page">
      {/* Background blobs */}
      <div className="landing-blob a" aria-hidden="true" />
      <div className="landing-blob b" aria-hidden="true" />

      {/* Animated ring */}
      <div className="landing-ring" ref={ringRef} aria-hidden="true">
        <svg viewBox="0 0 400 400">
          <defs>
            <path id="l-tp" d="M200,200 m-182,0 a182,182 0 1,1 364,0 a182,182 0 1,1 -364,0" />
          </defs>
          <g className="sc" data-k="0.5" ref={setScrollRef(0)}>
            <g className="s5">
              <text>
                <textPath href="#l-tp">BUY IT · SELL IT · BUILD IT · STUDY IT · BUY IT · SELL IT · BUILD IT · STUDY IT · BUY IT · SELL IT · BUILD IT · STUDY IT ·</textPath>
              </text>
            </g>
          </g>
          <g className="sc" data-k="1" ref={setScrollRef(1)}>
            <g className="s1">
              <circle ref={setBandRef(0)} className="bd" data-b="0" cx="200" cy="200" r="152" fill="none" stroke="#FFC83D" strokeWidth="22" strokeDasharray="64 10 16 10" />
            </g>
          </g>
          <g className="sc" data-k="-1.5" ref={setScrollRef(2)}>
            <g className="s2">
              <circle ref={setBandRef(1)} className="bd" data-b="1" cx="200" cy="200" r="126" fill="none" stroke="#FF4A3D" strokeWidth="17" strokeDasharray="34 14 9 14" />
            </g>
          </g>
          <g className="sc" data-k="2.2" ref={setScrollRef(3)}>
            <g className="s3">
              <circle ref={setBandRef(2)} className="bd" data-b="2" cx="200" cy="200" r="104" fill="none" stroke="#3D63FF" strokeWidth="15" strokeDasharray="22 8" />
            </g>
          </g>
          <g className="sc" data-k="-3" ref={setScrollRef(4)}>
            <g className="s4">
              <circle ref={setBandRef(3)} className="bd" data-b="3" cx="200" cy="200" r="84" fill="none" stroke="#5CF2C0" strokeWidth="10" strokeDasharray="10 7 3 7" />
            </g>
          </g>
          <circle cx="200" cy="200" r="66" fill="#04050D" stroke="#F3F1EA" strokeWidth="3" opacity="0.9" />
          <g ref={pupilRef as React.Ref<SVGGElement>}>
            <circle cx="200" cy="200" r="15" fill="#F3F1EA" />
            <circle cx="222" cy="222" r="5" fill="#3D63FF" />
          </g>
        </svg>
      </div>

      {/* Nav */}
      <nav>
        <div className="landing-nav-inner">
          <div className="landing-logo" onClick={() => goTo('/landing')}>
            <img src="/mallchain.svg" alt="Mallchain" className="landing-logo-mark" />
            Mallchain
          </div>

          <div className="landing-nav-links">
            <a href="#paths" onClick={() => setMenuOpen(false)}>Paths</a>
            <a href="#build" onClick={() => setMenuOpen(false)}>Roles</a>
            <a href="#study" onClick={() => setMenuOpen(false)}>Technology</a>
            <a href="#validate" onClick={() => setMenuOpen(false)}>Review</a>
          </div>

          <div className="landing-nav-actions">
            <button className="bt g" onClick={goLogin}>Login</button>
            <button className="bt" onClick={goSignup}>Get started</button>
          </div>

          <button className="landing-nav-toggle" aria-label="Toggle menu" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="landing-mobile-menu">
          <a href="#paths" onClick={() => setMenuOpen(false)}>Paths</a>
          <a href="#build" onClick={() => setMenuOpen(false)}>Roles</a>
          <a href="#study" onClick={() => setMenuOpen(false)}>Technology</a>
          <a href="#validate" onClick={() => setMenuOpen(false)}>Review</a>
          <button className="bt g" onClick={goLogin}>Login</button>
          <button className="bt" onClick={goSignup}>Get started</button>
        </div>
      )}

      <main>
        {/* Hero */}
        <header className="hero">
          <h1 className="vh">Mallchain</h1>
          <p className="sub">An open network you can use, create on, and learn from.</p>
          <div className="cta">
            <button className="bt" onClick={goSignup}>Create my wallet</button>
            <button className="bt g" onClick={goLogin}>Login</button>
          </div>
          <div className="cue">SCROLL</div>
        </header>

        {/* Paths */}
        <section>
          <div className="w">
            <h2 className="rv">Take part your way.</h2>
            <p className="lead rv">Mallchain is a choice, not a requirement. Use it, make something on it, or just learn how it works.</p>
            <div className="paths rv" id="paths">
              {PATHS.map((p) => (
                <a
                  key={p.title}
                  className="p"
                  style={{ '--c': p.color } as React.CSSProperties}
                  data-b={p.band}
                  onClick={(e) => { e.preventDefault(); handlePathClick(p.band); }}
                  onMouseEnter={() => setActiveBand(p.band)}
                  onMouseLeave={() => setActiveBand(-1)}
                  onFocus={() => setActiveBand(p.band)}
                  onBlur={() => setActiveBand(-1)}
                >
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                  <i>&rarr;</i>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="build">
          <div className="w">
            <h2 className="rv">Everyone has a seat.</h2>
            <p className="lead rv">A network stays useful when more people create, build and review on it. Pick a role.</p>
            <div className="roles">
              {ROLES.map((r) => (
                <a
                  key={r.title}
                  className="tile rv"
                  style={{ '--c': r.color } as React.CSSProperties}
                  onClick={(e) => { e.preventDefault(); goSignup(); }}
                >
                  <em />
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Tech */}
        <section id="study">
          <div className="w">
            <h2 className="rv">Open parts. Open to study.</h2>
            <p className="lead rv">Every layer uses widely adopted, open technology, so what you learn here carries to other projects.</p>
            <div className="three">
              {TECH.map((t) => (
                <div key={t.title} className="t rv" style={{ '--c': t.color } as React.CSSProperties}>
                  <em />
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / review lane */}
        <section id="validate">
          <div className="w trust">
            <div>
              <h2 className="rv">Reviewed in the open.</h2>
              <p className="lead rv">Staked, reputation-weighted reviewers check campaign engagement on-chain. Real activity is accepted and low-effort activity is rejected.</p>
            </div>
            <div className="lane rv">
              <svg viewBox="0 0 520 240" role="img" aria-label="Real engagement passes the reviewers and is accepted. A bot is rejected.">
                <path d="M10 66H510M10 176H510" stroke="rgba(243,241,234,.3)" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
                <rect x="215" y="18" width="90" height="204" rx="20" fill="rgba(255,200,61,.14)" stroke="#FFC83D" strokeWidth="2.5" />
                <text x="260" y="116" textAnchor="middle">Staked</text>
                <text x="260" y="140" textAnchor="middle">reviewers</text>
                <g className="ok1"><circle cx="20" cy="66" r="14" fill="#5CF2C0" /></g>
                <g className="bad">
                  <rect x="6" y="162" width="28" height="28" rx="7" fill="#FF4A3D" />
                  <path d="M14 171l12 12M26 171l-12 12" stroke="#04050D" strokeWidth="3" strokeLinecap="round" />
                </g>
                <text x="396" y="58" style={{ fill: '#5CF2C0' }}>Accepted</text>
                <text x="396" y="206" style={{ fill: '#FF4A3D' }}>Rejected</text>
              </svg>
            </div>
          </div>
        </section>

        {/* Quote + cycling icons */}
        <section>
          <div className="w">
            <p className="say rv">
              The network grows when people <b>use</b> it, <u>build</u> on it and <i>learn</i> from it.
            </p>
            <div className="ics rv" role="group" aria-label="Ways to take part">
              {ICON_SETS.map(({ set }) => (
                <CyclingIcon key={set} setName={set} reducedMotion={reducedMotion} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA footer */}
        <div className="fin" id="join">
          <h2 className="rv">Join the network.</h2>
          <button className="bt rv" onClick={goSignup}>Create my wallet</button>
        </div>

        <footer>Mallchain. Built on Cosmos SDK and CometBFT.</footer>
      </main>
    </div>
  );
}
