/**
 * Unit tests for useWizard — the shared multi-step flow hook.
 *
 * The main thing worth guarding here is the bug class that motivated this
 * hook: a wizard silently landing on the wrong step after a transition
 * (e.g. the original `setKycStep(2)` instead of `setKycStep(5)` bug). Under
 * useWizard, `next()`/`back()` are derived from the declared `steps` list so
 * they can't drift outside it, and persistence (durable/session tier) is
 * exercised directly against the real store/sessionStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWizard } from './useWizard';
import { store } from '../store/store';

const STEPS = ['one', 'two', 'three'] as const;
type Step = typeof STEPS[number];
interface Data extends Record<string, unknown> {
  note: string;
}

describe('useWizard', () => {
  beforeEach(() => {
    store.reset();
    sessionStorage.clear();
  });

  it('starts at the first declared step by default', () => {
    const { result } = renderHook(() =>
      useWizard<Step, Data>({ key: 'test:default', tier: 'durable', steps: STEPS, initialData: { note: '' } })
    );
    expect(result.current.step).toBe('one');
    expect(result.current.stepIndex).toBe(0);
  });

  it('next() advances exactly one step and never overshoots the end', () => {
    const { result } = renderHook(() =>
      useWizard<Step, Data>({ key: 'test:next', tier: 'durable', steps: STEPS, initialData: { note: '' } })
    );

    act(() => result.current.next());
    expect(result.current.step).toBe('two');

    act(() => result.current.next());
    expect(result.current.step).toBe('three');

    // Already at the last step — next() must not run off the end of the array.
    act(() => result.current.next());
    expect(result.current.step).toBe('three');
  });

  it('back() retreats exactly one step and never undershoots the start', () => {
    const { result } = renderHook(() =>
      useWizard<Step, Data>({ key: 'test:back', tier: 'durable', steps: STEPS, initialStep: 'two', initialData: { note: '' } })
    );

    act(() => result.current.back());
    expect(result.current.step).toBe('one');

    act(() => result.current.back());
    expect(result.current.step).toBe('one');
  });

  it('goTo() only accepts a step that is actually a member of the declared list (compile-time)', () => {
    const { result } = renderHook(() =>
      useWizard<Step, Data>({ key: 'test:goto', tier: 'durable', steps: STEPS, initialData: { note: '' } })
    );
    act(() => result.current.goTo('three'));
    expect(result.current.step).toBe('three');
    expect(result.current.stepIndex).toBe(2);
  });

  it('setData merges rather than replaces', () => {
    interface TwoFields extends Record<string, unknown> {
      a: string;
      b: string;
    }
    const { result } = renderHook(() =>
      useWizard<Step, TwoFields>({ key: 'test:merge', tier: 'durable', steps: STEPS, initialData: { a: '', b: '' } })
    );
    act(() => result.current.setData({ a: 'x' }));
    act(() => result.current.setData({ b: 'y' }));
    expect(result.current.data).toEqual({ a: 'x', b: 'y' });
  });

  describe('durable tier', () => {
    it('persists step + data through the store and resumes on remount', () => {
      const key = 'test:durable-resume';
      const { result, unmount } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'durable', steps: STEPS, initialData: { note: '' } })
      );
      act(() => {
        result.current.next();
        result.current.setData({ note: 'in progress' });
      });
      unmount();

      const { result: resumed } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'durable', steps: STEPS, initialData: { note: '' } })
      );
      expect(resumed.current.step).toBe('two');
      expect(resumed.current.data.note).toBe('in progress');
    });

    it('writes through to store.getFlow so cross-tab sync can pick it up', () => {
      const key = 'test:durable-store-write';
      const { result } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'durable', steps: STEPS, initialData: { note: '' } })
      );
      act(() => result.current.goTo('two'));
      expect(store.getFlow(key)?.step).toBe('two');
    });

    it('reset() clears the persisted record and returns to the initial step', () => {
      const key = 'test:durable-reset';
      const { result } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'durable', steps: STEPS, initialData: { note: '' } })
      );
      act(() => {
        result.current.goTo('three');
        result.current.setData({ note: 'x' });
      });
      act(() => result.current.reset());
      expect(result.current.step).toBe('one');
      expect(result.current.data.note).toBe('');
      expect(store.getFlow(key)).toBeUndefined();
    });
  });

  describe('session tier', () => {
    it('persists to sessionStorage, not the durable store', () => {
      const key = 'test:session-isolation';
      const { result } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'session', steps: STEPS, initialData: { note: '' } })
      );
      act(() => result.current.goTo('two'));

      expect(store.getFlow(key)).toBeUndefined();
      expect(sessionStorage.getItem('mallchain_session_draft_v14:' + key)).not.toBeNull();
    });

    it('resumes from sessionStorage on remount within the same session', () => {
      const key = 'test:session-resume';
      const { result, unmount } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'session', steps: STEPS, initialData: { note: '' } })
      );
      act(() => {
        result.current.goTo('three');
        result.current.setData({ note: 'sensitive' });
      });
      unmount();

      const { result: resumed } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'session', steps: STEPS, initialData: { note: '' } })
      );
      expect(resumed.current.step).toBe('three');
      expect(resumed.current.data.note).toBe('sensitive');
    });

    it('never persists to the store even across many mutations', () => {
      const key = 'test:session-never-durable';
      const { result } = renderHook(() =>
        useWizard<Step, Data>({ key, tier: 'session', steps: STEPS, initialData: { note: '' } })
      );
      act(() => {
        result.current.next();
        result.current.setData({ note: 'a' });
        result.current.next();
        result.current.setData({ note: 'b' });
      });
      expect(store.state.flows[key]).toBeUndefined();
    });
  });

  it('a stale persisted step outside the current steps list is ignored on hydration', () => {
    const key = 'test:stale-step';
    store.setFlow(key, { step: 'not-a-real-step', data: { note: 'orphaned' } });

    const { result } = renderHook(() =>
      useWizard<Step, Data>({ key, tier: 'durable', steps: STEPS, initialData: { note: 'fresh' } })
    );
    expect(result.current.step).toBe('one');
    expect(result.current.data.note).toBe('fresh');
  });
});
