/**
 * CipherSetup's confirm step — the one place a cipher may be graded
 * slot-by-slot (see compareGlyphs for why the unlock wall must not).
 *
 * The behaviour under test is the recovery path, not the happy path: a user
 * who mis-carves the sequence used to be told "the two carvings did not
 * match" and thrown back to a blank wall with no idea which glyph slipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CipherSetup } from './CipherWall';

function carve(cipher: string) {
  const input = screen.getByLabelText(/Prefer typing/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: cipher } });
  fireEvent.click(screen.getByRole('button', { name: /Load typed cipher/i }));
}

describe('CipherSetup confirm', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(),
    })));
  });

  it('grades a mis-carved confirmation instead of wiping the sequence', () => {
    const onSubmit = vi.fn();
    render(<CipherSetup onSubmit={onSubmit} />);

    carve('abcd');
    fireEvent.click(screen.getByRole('button', { name: 'Engrave cipher' }));

    // Re-carve with the last two glyphs traded — the classic slipped finger.
    carve('abdc');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cipher' }));

    expect(onSubmit).not.toHaveBeenCalled();
    const boxes = document.querySelectorAll('.gv-box');
    expect(boxes).toHaveLength(4);
    expect(boxes[0].className).toContain('gv-exact');
    expect(boxes[1].className).toContain('gv-exact');
    expect(boxes[2].className).toContain('gv-transposed');
    expect(boxes[3].className).toContain('gv-transposed');
    // Still in the confirm phase — the chosen sequence was not thrown away.
    expect(screen.getByRole('button', { name: 'Confirm cipher' })).toBeTruthy();
  });

  it('locks the cipher in when the confirmation matches', () => {
    const onSubmit = vi.fn();
    render(<CipherSetup onSubmit={onSubmit} />);

    carve('riverstone');
    fireEvent.click(screen.getByRole('button', { name: 'Engrave cipher' }));
    carve('riverstone');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cipher' }));

    expect(onSubmit).toHaveBeenCalledWith('riverstone');
    expect(document.querySelectorAll('.gv-box')).toHaveLength(0);
  });

  it('marks a glyph that is not in the cipher at all as absent', () => {
    const onSubmit = vi.fn();
    render(<CipherSetup onSubmit={onSubmit} />);

    carve('abcd');
    fireEvent.click(screen.getByRole('button', { name: 'Engrave cipher' }));
    carve('abce');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cipher' }));

    expect(onSubmit).not.toHaveBeenCalled();
    const boxes = document.querySelectorAll('.gv-box');
    expect(boxes[3].className).toContain('gv-absent');
  });

  it('stays honest when the two carvings differ in length', () => {
    const onSubmit = vi.fn();
    render(<CipherSetup onSubmit={onSubmit} />);

    carve('abcd');
    fireEvent.click(screen.getByRole('button', { name: 'Engrave cipher' }));
    carve('abcde');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cipher' }));

    expect(onSubmit).not.toHaveBeenCalled();
    // No slot colours: comparing positions across different lengths would
    // report confidence that does not exist.
    expect(document.querySelectorAll('.gv-box')).toHaveLength(0);
  });
});
