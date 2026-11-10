import { useEffect, useRef, useState } from 'react';
import { STEPS, STEP_GROUPS, type StepDef } from './order';

/**
 * The step list on the left of the page (above the cards on narrow screens).
 *
 * Fourteen settings in a single column need a map, and the map has to be able
 * to say more than "this exists": an amber dot marks a step whose data could
 * not be read, so the list tells you where the page is currently blind instead
 * of leaving you to notice a card that quietly disappeared.
 */

export type StepState = 'ok' | 'unread' | 'changed';

export interface SettingsNavProps {
  /** Per-step marker, keyed by step id. Anything absent is treated as ok. */
  states?: Record<string, StepState>;
}

export function SettingsNav({ states = {} }: SettingsNavProps) {
  const [active, setActive] = useState<number>(STEPS[0].index);
  const seen = useRef<Map<string, number>>(new Map());

  // The rail follows the card you are looking at. A plain scroll listener
  // re-measures the whole page on every pixel; an observer only fires when a
  // card crosses the band, which is also what "the one you are reading" means.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.current.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        const best = STEPS
          .map((step) => ({ step, ratio: seen.current.get(step.id) || 0 }))
          .filter((r) => r.ratio > 0)
          .sort((a, b) => (b.ratio - a.ratio) || (a.step.index - b.step.index))[0];
        if (best) setActive(best.step.index);
      },
      { rootMargin: '-84px 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    for (const step of STEPS) {
      const el = document.getElementById(step.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const goTo = (step: StepDef) => {
    const el = document.getElementById(step.id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(step.index);
  };

  return (
    <nav className="ps-nav" aria-label="Profile and settings sections">
      {STEP_GROUPS.map((group) => {
        const inGroup = STEPS.filter((s) => s.group === group);
        if (!inGroup.length) return null;
        return (
          <div key={group}>
            <div className="ps-nav-group">{group}</div>
            {inGroup.map((step) => {
              const state = states[step.id] || 'ok';
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goTo(step)}
                  aria-current={active === step.index}
                  title={state === 'unread' ? `${step.label} — data could not be read` : step.label}
                >
                  <span className="n">{String(step.index).padStart(2, '0')}</span>
                  <span>{step.label}</span>
                  <span className="dot" data-state={state === 'ok' ? undefined : state} />
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
