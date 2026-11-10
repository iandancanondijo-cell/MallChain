import { describe, expect, test } from 'vitest';
import { ACCENTS, applyAccent, resolveAccent } from './theme';

const vars = () => ['--accent', '--accent-2', '--accent-rgb'].map((k) => document.documentElement.style.getPropertyValue(k));

describe('applyAccent', () => {
  test('every accent sets all three variables, not a subset', () => {
    for (const a of ACCENTS) {
      applyAccent(a);
      const [base, deep, rgb] = vars();
      expect(base, a).not.toBe('');
      expect(deep, a).not.toBe('');
      expect(rgb, a).not.toBe('');
    }
  });

  test('the deeper shade and the rgb tint follow the chosen accent', () => {
    applyAccent('emerald');
    expect(vars()).toEqual(['#34d399', '#10b981', '52, 211, 153']);
    applyAccent('cyan');
    expect(vars()).toEqual(['#22d3ee', '#0ea5e9', '34, 211, 238']);
  });

  test('no two accents leave the theme looking the same', () => {
    const seen = new Set<string>();
    for (const a of ACCENTS) {
      applyAccent(a);
      seen.add(vars().join('|'));
    }
    expect(seen.size).toBe(ACCENTS.length);
  });

  test('an unrecognised stored value falls back to gold instead of unsetting the theme', () => {
    applyAccent('cyan');
    for (const bad of ['neon', '', undefined, null]) applyAccent(bad as never);
    expect(vars()[0]).toBe('#f3ba2f');
    expect(vars()[2]).toBe('243, 186, 47');
  });

  test('resolveAccent narrows to the union the store keeps', () => {
    expect(resolveAccent('purple')).toBe('purple');
    expect(resolveAccent('rose')).toBe('gold');
    expect(resolveAccent(undefined)).toBe('gold');
  });
});
