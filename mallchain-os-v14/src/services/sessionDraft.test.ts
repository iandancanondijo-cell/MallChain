/**
 * Unit tests for the session-tier flow persistence primitive.
 * Sensitive wizards (KYC, wallet creation, private key export) rely on this
 * being sessionStorage-backed and fully independent of the localStorage-based
 * `store` — same-tab-reload-resumable, never cross-tab, never durable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSessionDraft, setSessionDraft, clearSessionDraft } from './sessionDraft';

describe('sessionDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns undefined when nothing is stored', () => {
    expect(getSessionDraft('missing')).toBeUndefined();
  });

  it('round-trips step and data', () => {
    setSessionDraft<{ a: string }>('k', { step: 'one', data: { a: 'x' } });
    const draft = getSessionDraft<{ a: string }>('k');
    expect(draft?.step).toBe('one');
    expect(draft?.data).toEqual({ a: 'x' });
    expect(typeof draft?.updatedAt).toBe('number');
  });

  it('merges data across successive writes instead of replacing it', () => {
    setSessionDraft<{ a: string; b: string }>('k', { data: { a: 'x' } });
    setSessionDraft<{ a: string; b: string }>('k', { data: { b: 'y' } });
    expect(getSessionDraft<{ a: string; b: string }>('k')?.data).toEqual({ a: 'x', b: 'y' });
  });

  it('keeps the previous step when a write omits it', () => {
    setSessionDraft('k', { step: 'two', data: {} });
    setSessionDraft('k', { data: { x: 1 } });
    expect(getSessionDraft('k')?.step).toBe('two');
  });

  it('clearSessionDraft removes the record', () => {
    setSessionDraft('k', { step: 'one', data: {} });
    clearSessionDraft('k');
    expect(getSessionDraft('k')).toBeUndefined();
  });

  it('namespaces keys so they never collide with unrelated sessionStorage entries', () => {
    setSessionDraft('shared-name', { step: 'a', data: {} });
    sessionStorage.setItem('shared-name', 'unrelated raw value');
    expect(getSessionDraft('shared-name')?.step).toBe('a');
  });

  it('keeps two different keys fully independent', () => {
    setSessionDraft('kyc', { step: 'personal', data: { firstName: 'A' } });
    setSessionDraft('walletCreate', { step: 'create-seed', data: { mode: 'create' } });
    expect(getSessionDraft('kyc')?.step).toBe('personal');
    expect(getSessionDraft('walletCreate')?.step).toBe('create-seed');
  });

  it('never writes to localStorage', () => {
    setSessionDraft('k', { step: 'one', data: { secret: 'mnemonic words here' } });
    expect(localStorage.getItem('mallchain_session_draft_v14:k')).toBeNull();
  });

  it('does not throw when sessionStorage.setItem fails (e.g. quota/unavailable)', () => {
    // happy-dom's Storage is Proxy-backed — vi.spyOn is what reliably
    // intercepts calls here (plain prototype/property reassignment no-ops).
    const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => setSessionDraft('k', { step: 'one', data: {} })).not.toThrow();
    spy.mockRestore();
  });

  it('returns undefined instead of throwing on corrupted stored JSON', () => {
    sessionStorage.setItem('mallchain_session_draft_v14:k', '{not valid json');
    expect(getSessionDraft('k')).toBeUndefined();
  });
});
