/**
 * The theme accent, written by exactly one function.
 *
 * Three places used to set the accent custom properties themselves, each with a
 * different subset: App's mount effect wrote all three but ran once per page
 * load, Settings wrote only `--accent`, and TopBar wrote `--accent-2` as a flat
 * copy of `--accent` instead of the deeper shade. So picking emerald in Settings
 * recoloured the text but left every glow, ring and section bar gold — 15 CSS
 * rules read `--accent-rgb` — until the next reload, and the same choice looked
 * different depending on which menu you made it from.
 */

export const ACCENTS = ['gold', 'cyan', 'purple', 'emerald'] as const;
export type Accent = (typeof ACCENTS)[number];

const BASE: Record<Accent, string> = {
  gold: '#f3ba2f',
  cyan: '#22d3ee',
  purple: '#a78bfa',
  emerald: '#34d399',
};

/** The gradient partner of each accent; App has used these pairings all along. */
const DEEP: Record<Accent, string> = {
  gold: '#f59e0b',
  cyan: '#0ea5e9',
  purple: '#8b5cf6',
  emerald: '#10b981',
};

/** `rgba(var(--accent-rgb), .1)` — how components tint themselves to the theme. */
const RGB: Record<Accent, string> = {
  gold: '243, 186, 47',
  cyan: '34, 211, 238',
  purple: '167, 139, 250',
  emerald: '52, 211, 153',
};

/**
 * The stored or typed value is often wider than the union the store keeps
 * (`string` from the settings document, `never` casts from older callers), so
 * the narrowing happens here once instead of at every assignment. Anything
 * unrecognised becomes the shipped accent rather than an unset variable.
 */
export function resolveAccent(accent: string | undefined | null): Accent {
  return ACCENTS.includes(accent as Accent) ? (accent as Accent) : 'gold';
}

/** Unknown or missing stored values fall back to the shipped accent, gold. */
export function applyAccent(accent: string | undefined | null): void {
  const chosen = resolveAccent(accent);
  const root = document.documentElement;
  root.style.setProperty('--accent', BASE[chosen]);
  root.style.setProperty('--accent-2', DEEP[chosen]);
  root.style.setProperty('--accent-rgb', RGB[chosen]);
}
