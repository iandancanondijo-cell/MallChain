/**
 * Regression coverage for StatusChip: a Campaign document created while
 * two different Mongoose schemas were racing to register under the same
 * model name (see backend/src/routes/adminPanel.js) could persist with no
 * `status` field. StatusChip called `status.charAt(0)` unconditionally,
 * which crashed the whole admin Mining tab (caught only by the top-level
 * ErrorBoundary) the moment such a campaign was rendered.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { StatusChip, ToastHost, toastKind } from './ui';

describe('StatusChip', () => {
  test('renders a known status', () => {
    render(<StatusChip status="active" />);
    // StatusChip prefixes an icon (⏳/✓/✕/•) before the label as a non-color
    // status cue (WCAG 1.4.1) — the visible text is "⏳ Active", not "Active"
    // alone, so match on a regex rather than an exact string.
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toHaveAttribute('aria-label', 'Active');
  });

  test('does not throw when status is undefined', () => {
    expect(() => render(<StatusChip status={undefined} />)).not.toThrow();
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });

  test('does not throw when status is null', () => {
    expect(() => render(<StatusChip status={null} />)).not.toThrow();
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });
});

/**
 * The lapsed-session notice is the only thing that explains why the dashboard
 * turned into a sign-in form, and the symptom we chased live was a toast that
 * looked like it never appeared. Two ways that can genuinely happen — nobody
 * is listening because ToastHost is not mounted, and a shorter-than-expected
 * window — so both are pinned here, plus the positive case.
 */
describe('ToastHost', () => {
  /** The toast container, not the text `<span>` inside it — the kind class
   *  lives on `.toast`, so reading `getByText(...).className` finds nothing. */
  function currentToast(): Element | null {
    return document.querySelector('.toast-wrap .toast');
  }

  test('renders a warning toast and keeps it for exactly the duration it asked for', async () => {
    vi.useFakeTimers();
    try {
      render(<ToastHost />);
      act(() => { toastKind('Your session ended after its 30 minutes. Sign in again to continue.', 'warning', 10_000); });

      expect(currentToast()?.className).toContain('warning');
      expect(currentToast()?.textContent).toContain('Your session ended after its 30 minutes');

      // Past the 4.2s a plain toast would have taken, still on screen…
      await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
      expect(currentToast()).not.toBeNull();

      // …and gone once its own 10s window closes. (The dismiss timer's
      // setItems still needs an act() to flush into the DOM.)
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      expect(currentToast()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('the default window is 4.2s when a caller gives no duration', async () => {
    vi.useFakeTimers();
    try {
      render(<ToastHost />);
      act(() => { toastKind('A routine notice', 'info'); });
      expect(currentToast()).not.toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(4_300); });
      expect(currentToast()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a toast emitted before any ToastHost mounts is dropped, not queued', () => {
    // The bus is fire-and-forget: an emitter that runs first loses the notice,
    // which is why the session-end effect depends on `authInitialized` and so
    // the app mounts ToastHost in its own tree rather than behind a route.
    act(() => { toastKind('emitted before anyone was listening', 'warning', 10_000); });
    expect(document.querySelector('.toast-wrap')).toBeNull();

    render(<ToastHost />);
    expect(currentToast()).toBeNull();
  });
});
