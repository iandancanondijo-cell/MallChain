import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStoreVersion } from '../components/ui';
import { store } from '../store/store';
import { useLivePrice } from '../hooks/useLivePrice';
import '../styles/landing.css';

interface LandingProps {
  navigate: (path: string) => void;
}

const NS = 'http://www.w3.org/2000/svg';

type IconSpec = { d: string; c: string; label?: string };

const BAND = ['#FFC83D', '#7d95ff', '#5CF2C0', '#FF4A3D', '#3D63FF'];

const bandSet = (paths: string[]): IconSpec[] =>
  paths.map((d, i) => ({ d, c: BAND[i % BAND.length] }));

// Platform order, labels and colors mirror backend/src/config/socialRewardRates.js
const IC: Record<string, IconSpec[]> = {
  create: [
    { d: '<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.88 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9a6.33 6.33 0 00-.79-.05A6.34 6.34 0 003.15 15.3a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.05a8.28 8.28 0 004.76 1.5V7.1a4.83 4.83 0 01-1-.41z"/>', c: '#FE2C55', label: 'TikTok' },
    { d: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5"/>', c: '#E4405F', label: 'Instagram' },
    { d: '<rect x="2" y="4" width="20" height="16" rx="4"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>', c: '#FF0000', label: 'YouTube' },
    { d: '<path d="M21 12a9 9 0 01-13.4 7.8L3 21l1.2-4.6A9 9 0 1121 12z"/><path transform="translate(4.2 4.2) scale(0.65)" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>', c: '#25D366', label: 'WhatsApp' },
    { d: '<path d="M21.5 4.5L2.5 12.5l6.5 2 2 6.5 10.5-16.5z"/><path d="M9 14.5l4-4"/>', c: '#229ED9', label: 'Telegram' },
    { d: '<path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>', c: '#1877F2', label: 'Facebook' },
    { d: '<text x="12" y="17.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="currentColor" stroke="none">@</text>', c: '#000000', label: 'Threads' },
    { d: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z"/>', c: '#000000', label: 'X' },
    { d: '<path d="M12 3c3 0 5 2.3 5 5.2 0 .8 0 1.5.1 2 .5-.2 1.1-.4 1.5-.1.5.4.2 1-.4 1.4-.5.3-1.4.6-1.4 1.1 0 .9 1.7 2.6 3.2 3-.5.7-1.7.9-2.6 1-.1.5-.2 1.1-.5 1.2-.4.2-1.2-.1-2-.1-1 0-1.6.9-2.9.9s-1.9-.9-2.9-.9c-.8 0-1.6.3-2 .1-.3-.1-.4-.7-.5-1.2-.9-.1-2.1-.3-2.6-1 1.5-.4 3.2-2.1 3.2-3 0-.5-.9-.8-1.4-1.1-.6-.4-.9-1-.4-1.4.4-.3 1-.1 1.5.1.1-.5.1-1.2.1-2C7 5.3 9 3 12 3z"/>', c: '#FFFC00', label: 'Snapchat' },
    { d: '<circle cx="12" cy="12" r="10"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3"/>', c: '#FF4500', label: 'Reddit' },
    { d: '<path d="M18.9 6.3A13.6 13.6 0 0015.6 5l-.4.9a12.4 12.4 0 00-6.4 0L8.4 5A13.6 13.6 0 005.1 6.3C3 9.5 2.4 12.6 2.7 15.7A13.5 13.5 0 006.8 18l.9-1.4c-.5-.2-1-.4-1.4-.7l.3-.3a9.6 9.6 0 0010.8 0l.3.3c-.4.3-.9.5-1.4.7l.9 1.4a13.5 13.5 0 004.1-2.3c.4-3.6-.6-6.7-2.4-9.4z"/><ellipse cx="9.3" cy="12.2" rx="1.3" ry="1.5"/><ellipse cx="14.7" cy="12.2" rx="1.3" ry="1.5"/>', c: '#5865F2', label: 'Discord' },
    { d: '<path d="M20 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2zM8 17H5v-9h3zm-1.5-10.5A1.5 1.5 0 118 5a1.5 1.5 0 01-1.5 1.5zM19 17h-3v-4.74c0-1.42-.5-2.38-1.9-2.38-.96 0-1.6.65-1.85 1.27-.1.24-.12.57-.12.91V17h-3v-9h3v1.2a3.85 3.85 0 012.85-1.36c2.07 0 3.57 1.36 3.57 4.28z"/>', c: '#0A66C2', label: 'LinkedIn' },
    { d: '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 20.2l2.1-7.6M10.4 8.7A2.9 2.9 0 0112.9 7c1.8 0 3.1 1.3 3.1 3 0 2.2-1.6 4.1-3.6 4.1-1 0-1.9-.5-2.2-1.4"/>', c: '#E60023', label: 'Pinterest' },
    { d: '<path d="M4.3 3L3 6.4v14.2h4.7V23h2.6l2.5-2.4h3.9l5.3-5.3V3H4.3z"/><path d="M17.4 13.9l-3 3h-3.9l-2.5 2.4v-2.4H7V5h10.4v8.9z"/><path d="M14.8 8.1v4.3M10.7 8.1v4.3"/>', c: '#9146FF', label: 'Twitch' },
    { d: '<circle cx="12" cy="12" r="10"/><path d="M7.5 10.3c2.9-.9 6.2-.5 8.7 1M7.9 13.1c2.3-.7 5-.4 7 .8M8.4 15.7c1.8-.5 3.9-.3 5.5.6"/>', c: '#1DB954', label: 'Spotify' },
    { d: '<ellipse cx="6.8" cy="12" rx="4.8" ry="7.2"/><ellipse cx="16" cy="12" rx="2.4" ry="6.6"/><ellipse cx="21.2" cy="12" rx="1" ry="5.8"/>', c: '#000000', label: 'Medium / Blog' },
  ],
  build: bandSet([
    '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 10l3 2-3 2M12 15h5"/>',
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10a6 6 0 01-6 6H8"/>',
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    '<path d="M9 7a3 3 0 016 0v1H9zM7 11h10v4a5 5 0 01-10 0zM12 11v9M3 12h4M17 12h4M4 6l3 2M20 6l-3 2M4 20l3-2M20 20l-3-2"/>',
    '<path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3"/>',
  ]),
  trade: bandSet([
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
  ]),
  study: bandSet([
    '<path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2zM12 6v14"/>',
    '<path d="M4 4h12v16H6a2 2 0 01-2-2zM16 8h4v10a2 2 0 01-2 2h-2M7 8h6M7 12h6M7 16h3"/>',
    '<path d="M5 5h14v10H5zM2 19h20l-2-4H4z"/>',
    '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6"/>',
    '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
    '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  ]),
  validate: bandSet([
    '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8.5 12l2.5 2.5 4.5-5"/>',
    '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="12" cy="13" r="1.4"/><path d="M12 7l-6 9M12 7l6 9M7 18h10M12 7v5"/>',
    '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  ]),
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

// In-page anchors. Hash links would fight the hash router, so nav items
// scrollIntoView by element id instead.
const NAV_LINKS: { id: string; label: string }[] = [
  { id: 'mpesa', label: 'M-Pesa' },
  { id: 'paths', label: 'Ways in' },
  { id: 'build', label: 'Build' },
  { id: 'study', label: 'Study' },
  { id: 'validate', label: 'Validate' },
];

const MPESA_STEPS = [
  { title: 'Make an account', body: 'Sign up and create (or import) a wallet in one flow. The recovery phrase stays yours.' },
  { title: 'Pick an amount', body: 'Choose how much KSH to turn into MLCNS and give the Safaricom number that will pay.' },
  { title: 'Accept the push', body: 'Your phone asks for your M-Pesa PIN. Once it clears, MLCNS is credited on-chain — send it, stake it or spend it.' },
];

// Auto-contrast glyph color for a chip background (WCAG relative luminance)
function iconFg(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.5 ? '#06070F' : '#FFFFFF';
}

function CyclingIcon({ setName, reducedMotion }: { setName: string; reducedMotion: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const idxRef = useRef(0);
  const setLabel = ICON_SETS.find((i) => i.set === setName)?.label;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = IC[setName];
    if (!set) return;

    const apply = (spec: IconSpec) => {
      el.style.setProperty('--chip', spec.c);
      el.style.color = iconFg(spec.c);
      const label = spec.label || setLabel;
      if (label) {
        el.setAttribute('aria-label', label);
        el.setAttribute('title', label);
      }
    };
    const make = (spec: IconSpec, cls: string) => {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', cls);
      svg.innerHTML = spec.d;
      return svg;
    };

    apply(set[0]);
    el.appendChild(make(set[0], 'in'));

    if (reducedMotion) return;

    const baseDelay = 2300 + ICON_SETS.findIndex((i) => i.set === setName) * 430;
    const id = setInterval(() => {
      const current = el.querySelector('svg');
      if (current) current.setAttribute('class', 'out');
      setTimeout(() => {
        idxRef.current = (idxRef.current + 1) % set.length;
        const spec = set[idxRef.current];
        apply(spec);
        el.replaceChildren(make(spec, 'in'));
      }, 260);
    }, baseDelay);

    return () => {
      clearInterval(id);
    };
  }, [setName, reducedMotion, setLabel]);

  return <a ref={ref} className="ico" aria-label={setLabel} title={setLabel} />;
}

// Renders text as per-letter spans (word-wrapped) for the type-in effect; `from` continues the index into a following element
function Lettered({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(' ');
  let n = from;
  return (
    <>
      {words.map((word, wi) => (
        <React.Fragment key={wi}>
          <span className="wd">
            {[...word].map((ch) => {
              const i = n++;
              return (
                <span key={i} className="ltr" style={{ '--i': i } as React.CSSProperties}>
                  {ch}
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </>
  );
}

// Types the hero tagline letter by letter with human-irregular pauses and a
// blinking caret that disappears once the final full stop is revealed.
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  const done = n >= text.length;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return;
    }
    if (done) return;
    const prev = text[n - 1];
    let d = n === 0 ? 700 : 34 + Math.random() * 58;
    if (prev === ',') d += 190;
    if (Math.random() < 0.08) d += 260;
    const t = window.setTimeout(() => setN(n + 1), d);
    return () => clearTimeout(t);
  }, [n, text, done]);

  return (
    <span className="tw">
      <span className="vh">{text}</span>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {!done && <span className="tw-caret" aria-hidden="true" />}
    </span>
  );
}

export default function Landing({ navigate }: LandingProps) {
  useStoreVersion();

  const st = store.state;
  const price = useLivePrice();

  const [activeBand, setActiveBand] = useState(-1);
  const [doorOpen, setDoorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const ringRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<SVGGElement>(null);
  const bandsRef = useRef<SVGCircleElement[]>([]);
  const scrollLayersRef = useRef<SVGGElement[]>([]);

  const reducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const goTo = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const goSignup = useCallback(() => {
    navigate('/auth?mode=register');
  }, [navigate]);

  const goLogin = useCallback(() => {
    navigate('/auth?mode=login');
  }, [navigate]);

  // M-Pesa purchase is the landing page's primary action. Authed users go
  // straight to the buy flow; everyone else starts at signup, and the buy
  // page itself is reached from the wallet once they have an account.
  const goBuyMpesa = useCallback(() => {
    if (store.state.user.authed) navigate('/wallet/buy');
    else navigate('/auth?mode=register');
  }, [navigate]);

  const scrollToSection = useCallback((id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [reducedMotion]);

  const handlePathClick = useCallback((band: number) => {
    setActiveBand(band);
    setTimeout(() => setActiveBand(-1), 1600);
    // "Buy it" is the M-Pesa path — send people to the actual purchase flow
    // (or signup) instead of a generic register page.
    if (band === 0) {
      goBuyMpesa();
      return;
    }
    goSignup();
  }, [goSignup, goBuyMpesa]);

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
    // roles tiles have their own staged observers so they appear one after another
    document.querySelectorAll('.landing-page .rv').forEach((el) => {
      if (!el.closest('.roles')) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Roles tiles reveal sequentially: each tile triggers a step higher up the viewport
  useEffect(() => {
    const tiles = Array.from(document.querySelectorAll('.landing-page .roles .tile'));
    const observers = tiles.map((el, i) => {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: `0px 0px -${8 + i * 5}% 0px` },
      );
      io.observe(el);
      return io;
    });
    return () => observers.forEach((io) => io.disconnect());
  }, []);

  // Ring parallax + pupil pointer tracking (disabled on mobile to prevent Android compositor flicker)
  useEffect(() => {
    if (reducedMotion) return;
    if (window.matchMedia('(max-width: 768px)').matches) return;

    const ring = ringRef.current;
    const pupil = pupilRef.current;
    const scs = scrollLayersRef.current;
    if (!ring || !pupil || scs.length === 0) return;

    let cur = window.scrollY;
    let raf = 0;
    let px = 0;
    let py = 0;
    let vl = 0;
    let pop = 0;

    function updatePupil() {
      pupil!.style.transform = `translate(${px * 16}px, ${py * 16 + vl}px)`;
      pupil!.style.opacity = pop.toFixed(2);
    }

    function tick() {
      const y = window.scrollY;
      const h = Math.max(1, document.body.scrollHeight - window.innerHeight);
      cur += (y - cur) * 0.07;
      const pc = Math.min(1, cur / h);
      vl = Math.max(-26, Math.min(26, (y - cur) * 0.5));
      // pupil hides while the hero tagline overlaps the eye (scrollY < ~160)
      pop = Math.min(1, Math.max(0, (y - 60) / 100));

      scs.forEach((g) => {
        const k = parseFloat(g.dataset.k || '0');
        g.style.transform = `rotate(${(cur * k * 0.1).toFixed(2)}deg)`;
      });

      const size = ring!.offsetHeight;
      // 0.476 mirrors .landing-ring's CSS top (hero tagline center); center-anchored
      const rise = window.innerHeight * (0.5 - 0.476);
      ring!.style.transform = `translate(-50%, ${(-size / 2 + rise * pc).toFixed(1)}px) scale(${(1 + pc * 1.2).toFixed(3)})`;
      ring!.style.opacity = (0.62 - pc * 0.17).toFixed(2);
      updatePupil();

      raf = Math.abs(y - cur) > 0.2 ? requestAnimationFrame(tick) : 0;
    }

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
    updatePupil();

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
            <path id="l-tp" d="M200,200 m0,-182 a182,182 0 1,1 0,364 a182,182 0 1,1 0,-364" />
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
      <nav className={menuOpen ? 'menu-open' : ''}>
        <div className="landing-nav-wrap">
          <div className="landing-nav-inner">
            <div className="landing-logo" onClick={() => goTo('/landing')}>
              <img src="/mallchain.svg" alt="Mallchain" className="landing-logo-mark" />
              Mallchain
            </div>
            <div className="landing-nav-links">
              {NAV_LINKS.map((l) => (
                <button key={l.id} className="lk" onClick={() => scrollToSection(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="landing-nav-actions">
              {st.user.authed ? (
                <button className="bt" onClick={() => goTo('/')}>Open dashboard</button>
              ) : (
                <>
                  <button className="bt g" onClick={goLogin}>Login</button>
                  <button className="bt" onClick={goBuyMpesa}>Buy MLCNS</button>
                </>
              )}
            </div>
            <button
              className="landing-nav-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="landing-mobile-menu">
            {NAV_LINKS.map((l) => (
              <button key={l.id} className="lk" onClick={() => scrollToSection(l.id)}>
                {l.label}
              </button>
            ))}
            <div className="landing-mobile-actions">
              {st.user.authed ? (
                <button className="bt" onClick={() => { setMenuOpen(false); goTo('/'); }}>Open dashboard</button>
              ) : (
                <>
                  <button className="bt" onClick={() => { setMenuOpen(false); goBuyMpesa(); }}>Buy MLCNS with M-Pesa</button>
                  <button className="bt g" onClick={() => { setMenuOpen(false); goLogin(); }}>Login</button>
                  <button className="bt g" onClick={() => { setMenuOpen(false); goSignup(); }}>Create account</button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      <main>
        {/* Hero */}
        <header className="hero">
          <h1 className="vh">Mallchain</h1>
          <p className="sub"><Typewriter text="An open network you can use, create on, and learn from." /></p>
          <div className="cta">
            <button className="bt" onClick={goBuyMpesa}>
              Buy MLCNS with M-Pesa <span aria-hidden="true">&rarr;</span>
            </button>
            {st.user.authed ? (
              <button className="bt g" onClick={() => goTo('/')}>Open dashboard</button>
            ) : (
              <button className="bt g" onClick={goSignup}>Create account</button>
            )}
          </div>
          <div className="cue">
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="0" x2="8" y2="20" stroke="rgba(180,180,180,0.4)" strokeWidth="1" />
              <path d="M3 16l5 5 5-5" stroke="rgba(180,180,180,0.4)" strokeWidth="1" fill="none" />
            </svg>
          </div>
        </header>

        {/* M-Pesa purchase lane */}
        <section id="mpesa">
          <div className="w">
            <h2 className="rv">Pay with M-Pesa. Receive on-chain.</h2>
            <p className="lead rv">
              No exchange account, no card, no crypto jargon. Type an amount, take the STK push on your
              phone, and MLCNS arrives in your wallet from the chain
              {price.buyKes != null ? (
                <> — <span className="rate">right now 1 MLCNS ≈ KSh {price.buyKes.toFixed(2)}</span>, priced live from the network.</>
              ) : (
                ', priced live from the network.'
              )}
            </p>
            <div className="steps">
              {MPESA_STEPS.map((s, idx) => (
                <div
                  key={s.title}
                  className="step rv"
                  style={{ '--rv-delay': `${idx * 0.12}s` } as React.CSSProperties}
                >
                  <b>{idx + 1}</b>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
            <div className="cta mpesa-cta rv">
              <button className="bt" onClick={goBuyMpesa}>
                {st.user.authed ? 'Buy now with M-Pesa' : 'Start with M-Pesa'} <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </div>
        </section>

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
              {ROLES.map((r, idx) => (
                <a
                  key={r.title}
                  className="tile rv"
                  style={{ '--c': r.color, '--rv-delay': `${idx * 0.05}s` } as React.CSSProperties}
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
              {TECH.map((t, idx) => (
                <div
                  key={t.title}
                  className="t rv"
                  style={
                    {
                      '--c': t.color,
                      '--rv-delay': `${idx * 0.22}s`,
                      '--rv-tx': idx === 0 ? '-64px' : idx === 2 ? '64px' : '0px',
                    } as React.CSSProperties
                  }
                >
                  <em />
                  <h3><Lettered text={t.title} /></h3>
                  <p><Lettered text={t.body} from={t.title.length} /></p>
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

        <footer>Mallchain. Built on Cosmos SDK and CometBFT.</footer>
      </main>

      {/* Interactive door */}
      <div
        className={`landing-door ${doorOpen ? 'open' : ''}`}
        onClick={() => setDoorOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-label={doorOpen ? 'Close door' : 'Open door to enter'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDoorOpen((v) => !v); } }}
      >
        <div className="door-frame">
          <div className="door-panel">
            <div className="door-handle" />
            <div className="door-plate">
              <span className="door-plate-icon">&#9670;</span>
              <span className="door-plate-text">Enter</span>
            </div>
          </div>
          <div className="door-interior">
            <button className="bt" onClick={(e) => { e.stopPropagation(); goSignup(); }}>Sign up</button>
            <button className="bt g" onClick={(e) => { e.stopPropagation(); goLogin(); }}>Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
