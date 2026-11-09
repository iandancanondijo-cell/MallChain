/**
 * compareGlyphs — the enrollment-only confirm grader.
 *
 * Two things are pinned here: that a mis-carved cipher is explained usefully
 * (which slot, and why), and that the grading never invents a glyph the user
 * did not carve. The second one matters because this colour set is the same
 * one an unlock screen must NEVER show: over-counting would be a leak even in
 * the enrollment case, where a repeated glyph could look confirmed twice.
 */
import { describe, it, expect } from 'vitest';
import { compareGlyphs } from './CipherWall';

describe('compareGlyphs', () => {
  it('marks every slot exact when the sequence is re-carved correctly', () => {
    expect(compareGlyphs('abcd', 'abcd')).toEqual(['exact', 'exact', 'exact', 'exact']);
  });

  it('marks a swapped pair as transposed rather than two wrong slots', () => {
    expect(compareGlyphs('abcd', 'abdc')).toEqual(['exact', 'exact', 'transposed', 'transposed']);
    // The swap can also sit at the very start of the sequence.
    expect(compareGlyphs('abcd', 'bacd')).toEqual(['transposed', 'transposed', 'exact', 'exact']);
  });

  it('marks glyphs that belong in the cipher but not in these slots', () => {
    // Every glyph of 'abcd' is present in 'bcda', none of them in its own
    // slot, and no two of them are an adjacent swap — so all four are yellow.
    expect(compareGlyphs('abcd', 'bcda')).toEqual(['elsewhere', 'elsewhere', 'elsewhere', 'elsewhere']);
    // Two of 'dbca' genuinely are in the right slot; grading must say so.
    expect(compareGlyphs('abcd', 'dbca')).toEqual(['elsewhere', 'exact', 'exact', 'elsewhere']);
  });

  it('marks glyphs that are not in the cipher at all', () => {
    expect(compareGlyphs('abcd', 'abxy')).toEqual(['exact', 'exact', 'absent', 'absent']);
  });

  it('does not credit a repeated glyph more times than it was carved', () => {
    // 'aab' holds two a's, so the third slot cannot also be 'elsewhere'.
    expect(compareGlyphs('aab', 'aaa')).toEqual(['exact', 'exact', 'absent']);
    expect(compareGlyphs('abc', 'aac')).toEqual(['exact', 'absent', 'exact']);
  });

  it('grades a rotated pair as transposed while leaving the exact slots alone', () => {
    expect(compareGlyphs('aab', 'aba')).toEqual(['exact', 'transposed', 'transposed']);
  });

  it('gives no positional verdict at all when the lengths differ', () => {
    expect(compareGlyphs('abcd', 'abc')).toEqual(['absent', 'absent', 'absent']);
    expect(compareGlyphs('abc', 'abcd')).toEqual(['absent', 'absent', 'absent', 'absent']);
  });

  it('counts glyphs, not UTF-16 units, so a hieroglyph is one slot', () => {
    // 𓄿 (U+1313F) is a surrogate pair in JS strings; slot arithmetic must
    // treat it as the single glyph the wall shows.
    const glyph = '𓄿';
    expect([...glyph]).toHaveLength(1);
    expect(compareGlyphs(`${glyph}ab`, `${glyph}ab`)).toEqual(['exact', 'exact', 'exact']);
    // Same code point in two different slots, counted once each.
    expect(compareGlyphs(`${glyph}ab`, `ab${glyph}`)).toHaveLength(3);
  });
});
