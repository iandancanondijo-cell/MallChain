/**
 * Crypt Cipher Wall — the replacement for the numeric PIN prompt.
 *
 * A carved stone wall scattered with glyphs (Egyptian hieroglyphs, symbols,
 * digits, letters — "all shapes, characters, numbers, signs"). The wallet
 * secret is the ORDERED SEQUENCE of glyphs the user picks: whichever cipher
 * they engrave when creating the wallet is exactly what locks and unlocks
 * it (services/security.ts derive the AES key from that glyph string and
 * mirror a bcrypt hash server-side for rate-limited verification).
 *
 * Visually ported from the standalone demo (crypt-cipher-wall.html):
 * stone-wall scene, torch-glow cursor lighting, floating dust, breathing
 * glyphs. Deliberately dropped from the demo: riddles/XP/combos, the
 * 6-hour per-tile glyph lock (the real anti-brute-force authority here is
 * the server-side PinAttempt lockout, not hiding tiles), the reward modal,
 * and sound.
 *
 * Exported pieces:
 *   <CipherWall/>     — one wall, one submission (challenge + plain choose).
 *   <CipherSetup/>    — choose, then re-pick the same sequence to confirm;
 *                       used by wallet creation/import and Security Settings.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { secretGlyphs, SECRET_MIN_GLYPHS, SECRET_MAX_GLYPHS } from '../services/security';

export const CIPHER_MIN = SECRET_MIN_GLYPHS; // 4
export const CIPHER_MAX = SECRET_MAX_GLYPHS; // 12

// Glyph pools (same sets as the demo, all pools now clickable).
const HIERO = ['𓄿', '𓇋', '𓅱', '𓃀', '𓊪', '𓆑', '𓅓', '𓈖', '𓂋', '𓉔', '𓎛', '𓐍', '𓄡', '𓋴', '𓈙', '𓈎', '𓎡', '𓎼', '𓏏', '𓂧'];
const SYMBOLS = ['△', '□', '○', '◇', '★', '✦', '✧', '✶', '✷', '✹', 'Ω', 'Σ', 'Φ', 'Δ', 'Ψ', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚱ', 'ᛟ', 'ᛞ', 'א', 'ב', 'ג', 'ד', 'ה', 'Ж', 'Я', 'Ю', '♔', '♕', '♖', '※', '✠', '∞'];
const NUMBERS = '0123456789'.split('');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const COLS = 16;
const ROWS = 9;

interface Tile {
  id: string;
  char: string;
  x: number; // % within scene
  y: number;
  size: number; // rem
  rotate: number; // deg
  baseOpacity: number;
}

interface Pick {
  tileId: string;
  char: string;
}

function pickGlyph(): string {
  const r = Math.random();
  if (r < 0.3) return HIERO[Math.floor(Math.random() * HIERO.length)];
  if (r < 0.58) return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  if (r < 0.78) return NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Generate one wall layout: ~86% of the grid cells carved, each a random glyph. */
function generateTiles(version: number): Tile[] {
  const cells: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) cells.push({ i, j });
  shuffle(cells);
  const active = cells.slice(Math.floor(cells.length * 0.14));
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;
  return active.map((cell, idx) => {
    const depth = Math.random();
    return {
      id: `w${version}_t${idx}`,
      char: pickGlyph(),
      x: cell.i * cellW + cellW / 2 + (Math.random() - 0.5) * cellW * 0.75,
      y: cell.j * cellH + cellH / 2 + (Math.random() - 0.5) * cellH * 0.75,
      size: 0.85 + depth * 0.9,
      rotate: (Math.random() - 0.5) * 24,
      baseOpacity: 0.12 + depth * 0.22,
    };
  });
}

/** UTF-8 guard shared with the backend bcrypt 72-byte truncation ceiling. */
export function cipherByteLengthOk(cipher: string): boolean {
  return new TextEncoder().encode(cipher).length <= 64;
}

export interface CipherWallProps {
  /** Called with the joined glyph sequence; the wall then clears its picks. */
  onSubmit: (cipher: string) => void;
  actionLabel?: string;
  subtitle?: ReactNode;
  busy?: boolean;
  error?: string | null;
  /** Disable all input (server lockout countdown running, migration in progress…). */
  locked?: boolean;
  /** Extra row rendered under the buttons (e.g. the legacy-PIN link). */
  footer?: ReactNode;
}

export function CipherWall({ onSubmit, actionLabel = 'Confirm', subtitle, busy = false, error = null, locked = false, footer }: CipherWallProps) {
  const [wallVersion, setWallVersion] = useState(0);
  const tiles = useMemo(() => generateTiles(wallVersion), [wallVersion]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [typed, setTyped] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  const sceneRef = useRef<HTMLDivElement>(null);
  const torchRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const tileEls = useRef(new Map<string, HTMLDivElement>());
  const tileData = useRef(new Map<string, Tile>());
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef(0);

  useEffect(() => {
    tileData.current = new Map(tiles.map((t) => [t.id, t]));
  }, [tiles]);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (!locked) setLocalErr(null);
  }, [locked]);

  // ── torch cursor lighting (direct DOM writes, rAF-throttled — as in the demo)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const applyLighting = () => {
      rafRef.current = 0;
      const rect = scene.getBoundingClientRect();
      if (!rect.width) return;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const radiusPct = (200 / rect.width) * 100;
      tiles.forEach((g) => {
        const el = tileEls.current.get(g.id);
        if (!el) return;
        const inner = el.firstElementChild as HTMLElement | null;
        const dx = g.x - mx;
        const dy = g.y - my * (rect.width / rect.height);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = dist < radiusPct ? Math.max(0, 1 - dist / radiusPct) : 0;
        const picked = el.classList.contains('cw-picked');
        if (inner && !picked) {
          const flicker = reducedMotion ? 1 : 0.94 + Math.random() * 0.12;
          const op = Math.min(1, g.baseOpacity + boost * 0.85 * flicker);
          inner.style.color = `rgba(${Math.round(255 - boost * 20)},${Math.round(215 - boost * 20)},${Math.round(140 - boost * 60)},${op.toFixed(3)})`;
          inner.style.textShadow = boost > 0.05 ? `0 0 ${boost * 22}px rgba(255,197,110,${boost.toFixed(2)})` : 'none';
        }
        el.style.transform = `translate(-50%,-50%) scale(${boost > 0.15 ? 1 + boost * 0.28 : 1})`;
      });
    };
    const schedule = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(applyLighting);
    };
    const move = (e: PointerEvent) => {
      const rect = scene.getBoundingClientRect();
      mouseRef.current = { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
      if (torchRef.current) {
        torchRef.current.style.left = `${e.clientX - rect.left}px`;
        torchRef.current.style.top = `${e.clientY - rect.top}px`;
        torchRef.current.style.opacity = '0.9';
      }
      schedule();
    };
    const leave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
      if (torchRef.current) torchRef.current.style.opacity = '0';
      schedule();
    };
    scene.addEventListener('pointermove', move);
    scene.addEventListener('pointerleave', leave);
    schedule();
    return () => {
      scene.removeEventListener('pointermove', move);
      scene.removeEventListener('pointerleave', leave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tiles, reducedMotion]);

  // ── floating dust motes
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = dustRef.current;
    if (!scene || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let parts: Array<{ x: number; y: number; r: number; vx: number; vy: number; a: number }> = [];
    let raf = 0;
    let alive = true;
    const init = () => {
      const rect = scene.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      parts = Array.from({ length: 40 }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        r: Math.random() * 1.4 + 0.4,
        vy: -(Math.random() * 0.12 + 0.03),
        vx: (Math.random() - 0.5) * 0.08,
        a: Math.random() * 0.4 + 0.1,
      }));
    };
    const draw = () => {
      if (!alive) return;
      if (!reducedMotion) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -5) p.y = canvas.height + 5;
          if (p.x < -5) p.x = canvas.width + 5;
          if (p.x > canvas.width + 5) p.x = -5;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,214,150,${Math.min(0.7, p.a)})`;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    init();
    draw();
    const ro = new ResizeObserver(init);
    ro.observe(scene);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reducedMotion]);

  const pickedTileIds = useMemo(() => new Set(picks.map((p) => p.tileId)), [picks]);
  const full = picks.length >= CIPHER_MAX;

  const onTileClick = (t: Tile) => {
    if (locked || busy) return;
    if (pickedTileIds.has(t.id)) {
      setLocalErr('That tile is already carved into your cipher — undo or pick another.');
      return;
    }
    if (full) {
      setLocalErr(`Cipher is full (${CIPHER_MAX} glyphs) — undo or start over.`);
      return;
    }
    setPicks((p) => [...p, { tileId: t.id, char: t.char }]);
  };

  const undo = () => setPicks((p) => p.slice(0, -1));
  const clearPicks = () => {
    setPicks([]);
    setLocalErr(null);
  };

  const submit = () => {
    if (locked || busy) return;
    if (picks.length < CIPHER_MIN) {
      setLocalErr(`Pick at least ${CIPHER_MIN} glyphs.`);
      return;
    }
    const cipher = picks.map((p) => p.char).join('');
    if (!cipherByteLengthOk(cipher)) {
      setLocalErr('Cipher is too heavy for the gate (UTF-8 > 64 bytes) — swap some wide glyphs out.');
      return;
    }
    setPicks([]);
    setLocalErr(null);
    onSubmit(cipher);
  };

  const applyTyped = () => {
    const glyphs = secretGlyphs(typed.trim());
    if (glyphs.length < CIPHER_MIN || glyphs.length > CIPHER_MAX) {
      setLocalErr(`Typed cipher must be ${CIPHER_MIN}-${CIPHER_MAX} characters.`);
      return;
    }
    setPicks(glyphs.map((char, i) => ({ tileId: `typed_${wallVersion}_${i}`, char })));
    setTyped('');
    setLocalErr(null);
  };

  const shownError = localErr || error;
  const shake = shownError ? ' cw-shake' : '';

  return (
    <div className="cw-root">
      <style>{CW_CSS}</style>
      <div className="cw-slots-wrap">
        <div className="cw-eyebrow">Your cipher · {picks.length}/{CIPHER_MAX}</div>
        <div className={`cw-slots${picks.length ? '' : ' cw-slots-empty'}${shake}`}>
          {Array.from({ length: Math.max(CIPHER_MIN, picks.length) }).map((_, i) => {
            const p = picks[i];
            return (
              <div key={i} className={`cw-slot${p ? ' cw-filled' : ''}`}>
                {p ? p.char : ''}
              </div>
            );
          })}
          {picks.length === 0 && Array.from({ length: CIPHER_MIN }).map((_, i) => <div key={`e${i}`} className="cw-slot" />)}
        </div>
        {subtitle && <div className="cw-subtitle">{subtitle}</div>}
      </div>

      <div className={`cw-scene${locked ? ' cw-locked' : ''}`} ref={sceneRef}>
        <div className="cw-stone" />
        <canvas className="cw-dust" ref={dustRef} />
        <div className="cw-wall" role="group" aria-label="Cipher wall of clickable glyphs">
          {tiles.map((t) => (
            <div
              key={t.id}
              ref={(el) => {
                if (el) tileEls.current.set(t.id, el);
                else tileEls.current.delete(t.id);
              }}
              className={`cw-glyph${pickedTileIds.has(t.id) ? ' cw-picked' : ''}`}
              style={{ left: `${t.x}%`, top: `${t.y}%`, fontSize: `${t.size}rem` }}
              onClick={() => onTileClick(t)}
              aria-label={picks.length === 0 ? 'glyph' : undefined}
            >
              <span
                className="cw-g-inner"
                style={{
                  transform: `rotate(${t.rotate}deg)`,
                  animationDelay: reducedMotion ? '0s' : `${(parseInt(t.id.replace(/\D/g, ''), 10) % 60) / 10}s`,
                  color: `rgba(200,190,170,${t.baseOpacity})`,
                }}
              >
                {t.char}
              </span>
            </div>
          ))}
        </div>
        <div className="cw-torch" ref={torchRef} />
        <div className="cw-vignette" />
      </div>

      <div className="cw-controls">
        <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={locked || busy || picks.length === 0}>Undo</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearPicks} disabled={locked || busy || picks.length === 0}>Start over</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setWallVersion((v) => v + 1); setPicks([]); }} disabled={locked || busy}>New wall</button>
      </div>

      <div className="cw-a11y">
        <label htmlFor={`cw-typed-${wallVersion}`}>Prefer typing?</label>
        <input
          id={`cw-typed-${wallVersion}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          disabled={locked || busy}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyTyped(); } }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={applyTyped} disabled={locked || busy || !typed.trim()}>Load typed cipher</button>
      </div>

      {shownError && <div className="cw-error">{shownError}</div>}

      <div className="cw-actions">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={locked || busy || picks.length < CIPHER_MIN}>
          {busy ? 'Verifying…' : locked ? 'Locked' : actionLabel}
        </button>
      </div>
      {footer}
    </div>
  );
}

/**
 * Two-phase cipher enrollment: carve a sequence, then re-carve the same one
 * on a fresh wall to confirm it was engraved as intended.
 */
export function CipherSetup({ onSubmit, busy = false, error = null }: { onSubmit: (cipher: string) => void; busy?: boolean; error?: string | null }) {
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose');
  const [target, setTarget] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);
  /** The sequence that failed the confirm pass — what the verdict row grades. */
  const [lastAttempt, setLastAttempt] = useState('');

  if (phase === 'choose') {
    return (
      <CipherWall
        actionLabel="Engrave cipher"
        subtitle="Tap the glyphs in order — this exact sequence becomes the only key to your wallet. Take your time; it cannot be recovered if forgotten."
        onSubmit={(cipher) => {
          setTarget(cipher);
          setMismatch(null);
          setLastAttempt('');
          setPhase('confirm');
        }}
        busy={busy}
        error={error}
      />
    );
  }

  // Slot-by-slot colours only mean something between two sequences of the
  // same length; a short/long carve just gets told the count is wrong.
  const verdicts = mismatch && [...target].length === [...lastAttempt].length
    ? compareGlyphs(target, lastAttempt)
    : null;

  return (
    <CipherWall
      actionLabel="Confirm cipher"
      subtitle={
        <>
          {verdicts === null
            ? `Carve the same sequence again to lock it in — ${CIPHER_MIN}-${CIPHER_MAX} glyphs, in order.`
            : 'Fix the marked slots and carve it again.'}
          {verdicts !== null && <GlyphVerdictRow attempt={lastAttempt} verdicts={verdicts} />}
        </>
      }
      onSubmit={(cipher) => {
        if (cipher === target) {
          onSubmit(target);
          return;
        }
        // The carvings differ: stay in this phase and say *how*, instead of
        // wiping the sequence and sending the user back to a blank wall.
        setLastAttempt(cipher);
        setMismatch('The two carvings did not match.');
      }}
      busy={busy}
      error={mismatch || error}
      footer={
        <div className="cw-controls">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPhase('choose'); setTarget(''); setMismatch(null); setLastAttempt(''); }}>
            ← Choose again
          </button>
        </div>
      }
    />
  );
}

export type GlyphVerdict = 'exact' | 'transposed' | 'elsewhere' | 'absent';

const VERDICT_WORDS: Record<GlyphVerdict, string> = {
  exact: 'right glyph, right slot',
  transposed: 'right glyph — carved one slot too early or too late',
  elsewhere: 'in your cipher, just not here',
  absent: 'not in your cipher',
};

/**
 * Slot-by-slot comparison of a re-carved cipher against the sequence the user
 * just chose — green where it matches, orange for a glyph that belongs one
 * slot away, yellow for one that belongs somewhere else, red for a glyph that
 * isn't in the cipher at all.
 *
 * Enrollment is the ONLY place this may be computed. The "answer" here is the
 * sequence the user is holding in their own hands, a few seconds before it
 * becomes anything. On the unlock wall the same four colours would be a
 * decomposition oracle: every failed attempt would leak which glyphs the
 * cipher contains and where they sit, so a 12-glyph secret would fall apart
 * one confirmed glyph at a time instead of all-or-nothing. Unlock therefore
 * answers with one bit — it opened, or it did not — and CipherWall never
 * learns this function.
 */
export function compareGlyphs(target: string, attempt: string): GlyphVerdict[] {
  const t = [...target];
  const a = [...attempt];
  // Different lengths make "same slot" meaningless; CipherSetup falls back to
  // the plain mismatch message in that case.
  if (t.length !== a.length) return a.map(() => 'absent');

  const verdict: GlyphVerdict[] = a.map(() => 'absent');
  const consumedTarget = t.map(() => false);

  for (let i = 0; i < a.length; i++) {
    if (a[i] === t[i]) {
      verdict[i] = 'exact';
      consumedTarget[i] = true;
    }
  }

  // A swapped pair is two adjacent slots that would be exact if traded.
  for (let i = 0; i + 1 < a.length; i++) {
    if (verdict[i] === 'exact' || verdict[i + 1] === 'exact') continue;
    if (a[i] === t[i + 1] && a[i + 1] === t[i]) {
      verdict[i] = 'transposed';
      verdict[i + 1] = 'transposed';
      consumedTarget[i] = true;
      consumedTarget[i + 1] = true;
    }
  }

  const spare = new Map<string, number>();
  t.forEach((glyph, i) => {
    if (!consumedTarget[i]) spare.set(glyph, (spare.get(glyph) || 0) + 1);
  });
  for (let i = 0; i < a.length; i++) {
    if (verdict[i] !== 'absent') continue;
    const left = spare.get(a[i]) || 0;
    if (left > 0) {
      verdict[i] = 'elsewhere';
      spare.set(a[i], left - 1);
    }
  }
  return verdict;
}

function GlyphVerdictRow({ attempt, verdicts }: { attempt: string; verdicts: GlyphVerdict[] }) {
  const glyphs = [...attempt];
  return (
    <div className="gv-wrap" role="status">
      <div className="gv-row">
        {glyphs.map((glyph, i) => (
          <span key={`${i}-${glyph}`} className={`gv-box gv-${verdicts[i]}`} title={VERDICT_WORDS[verdicts[i]]}>
            {glyph}
            <span className="sr-only">{`: ${VERDICT_WORDS[verdicts[i]]}`}</span>
          </span>
        ))}
      </div>
      <div className="gv-legend">
        <span><i className="gv-swatch gv-exact" />{VERDICT_WORDS.exact}</span>
        <span><i className="gv-swatch gv-transposed" />{VERDICT_WORDS.transposed}</span>
        <span><i className="gv-swatch gv-elsewhere" />{VERDICT_WORDS.elsewhere}</span>
        <span><i className="gv-swatch gv-absent" />{VERDICT_WORDS.absent}</span>
      </div>
    </div>
  );
}

// ── styles (scoped by cw- prefix; stone palette from the demo) ──────────────
const CW_CSS = `
.cw-root{display:flex;flex-direction:column;gap:12px;}
.cw-eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#d4a537;margin-bottom:6px;}
.cw-subtitle{font-size:12.5px;color:#a89878;line-height:1.55;margin-top:8px;}
.cw-slots{display:flex;gap:8px;flex-wrap:wrap;}
.cw-slot{width:38px;height:46px;border:1.5px solid rgba(212,165,55,0.35);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;background:rgba(0,0,0,0.35);color:#e9ddc2;font-family:'Noto Sans Egyptian Hieroglyphs','Segoe UI Historic','Antiqua',serif;}
.cw-slot.cw-filled{border-color:#d4a537;background:rgba(212,165,55,0.16);box-shadow:0 0 10px rgba(212,165,55,0.25);}
.cw-shake{animation:cwShake 0.5s ease;}
.cw-shake .cw-slot{border-color:#e2823f !important;box-shadow:0 0 14px rgba(226,130,63,0.6);}
@keyframes cwShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-6px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}
/* Enrollment confirm verdicts. Green = the slot is right, orange = right glyph
   carved one slot early/late, yellow = glyph belongs elsewhere in the cipher,
   red = glyph isn't in the cipher. Enrollment only — see compareGlyphs(). */
.gv-wrap{display:flex;flex-direction:column;gap:8px;margin-top:10px;}
.gv-row{display:flex;gap:6px;flex-wrap:wrap;}
.gv-box{width:34px;height:40px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#120c04;border:1px solid rgba(0,0,0,0.35);font-family:'Noto Sans Egyptian Hieroglyphs','Segoe UI Historic','Antiqua',serif;}
.gv-exact{background:#3fbf6a;box-shadow:0 0 12px rgba(63,191,106,0.6);}
.gv-transposed{background:#ff8a3d;box-shadow:0 0 10px rgba(255,138,61,0.45);}
.gv-elsewhere{background:#f3ba2f;box-shadow:0 0 10px rgba(243,186,47,0.4);}
.gv-absent{background:#6a6a72;color:#e9e6df;}
.gv-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--txt-3,#c9c2b4);}
.gv-legend span{display:inline-flex;align-items:center;gap:5px;}
.gv-swatch{width:10px;height:10px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,0.3);}
.cw-scene{position:relative;width:100%;height:400px;border-radius:14px;overflow:hidden;border:1px solid rgba(212,165,55,0.2);box-shadow:0 20px 60px rgba(0,0,0,0.6);touch-action:pan-y;}
.cw-scene.cw-locked{opacity:0.55;pointer-events:none;}
.cw-stone{position:absolute;inset:0;background:
  radial-gradient(ellipse at 30% 20%, rgba(60,45,30,0.5), transparent 55%),
  radial-gradient(ellipse at 75% 70%, rgba(50,38,26,0.4), transparent 55%),
  repeating-linear-gradient(115deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 2px, transparent 2px, transparent 40px),
  repeating-linear-gradient(25deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 55px),
  linear-gradient(160deg, #3c2d1e, #241b13 45%, #120e0a 100%);}
.cw-stone::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");mix-blend-mode:overlay;}
.cw-vignette{position:absolute;inset:0;box-shadow:inset 0 0 140px 40px rgba(0,0,0,0.75);pointer-events:none;}
.cw-torch{position:absolute;top:0;left:0;width:400px;height:400px;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;background:radial-gradient(circle, rgba(255,197,110,0.55) 0%, rgba(226,131,63,0.28) 32%, transparent 70%);filter:blur(30px);opacity:0;transition:opacity 0.2s ease;mix-blend-mode:screen;}
.cw-dust{position:absolute;inset:0;pointer-events:none;}
.cw-wall{position:absolute;inset:0;}
.cw-glyph{position:absolute;transform:translate(-50%,-50%);user-select:none;line-height:1;cursor:pointer;font-family:'Noto Sans Egyptian Hieroglyphs','Segoe UI Historic','Antiqua',serif;}
.cw-glyph .cw-g-inner{display:block;animation:cwBreathe 7s ease-in-out infinite;}
@keyframes cwBreathe{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}
.cw-glyph.cw-picked .cw-g-inner{color:#e8c874 !important;text-shadow:0 0 14px rgba(212,165,55,0.9);}
.cw-glyph.cw-picked{pointer-events:auto;}
.cw-controls{display:flex;gap:8px;flex-wrap:wrap;}
.cw-a11y{display:flex;gap:8px;align-items:center;font-size:11px;color:#a89878;}
.cw-a11y input{background:rgba(0,0,0,0.35);border:1px solid rgba(212,165,55,0.3);border-radius:6px;color:#e9ddc2;padding:6px 10px;font-family:inherit;min-width:0;flex:1;}
.cw-error{color:#e2823f;font-size:13px;display:flex;align-items:center;gap:8px;}
.cw-actions{display:flex;gap:10px;}
.cw-actions .btn-primary{flex:1;}
@media (max-width:600px){.cw-scene{height:320px;}.cw-slot{width:30px;height:38px;font-size:16px;}}
`;

export default CipherWall;
