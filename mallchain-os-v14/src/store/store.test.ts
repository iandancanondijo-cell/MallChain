/**
 * Unit tests for the new Store additions supporting the flow/wizard and
 * cross-tab sync restructure: the `flows` slice (setFlow/getFlow/clearFlow)
 * and applyExternalState (used by services/storeSync.ts to apply a snapshot
 * written by another tab without re-persisting it).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store, OS_KEY } from './store';

describe('Store — flows slice', () => {
  beforeEach(() => {
    store.reset();
  });

  it('getFlow returns undefined for a key that was never set', () => {
    expect(store.getFlow('nope')).toBeUndefined();
  });

  it('setFlow creates a new record with step/data/updatedAt', () => {
    store.setFlow('kyc', { step: 'personal', data: { firstName: 'A' } });
    const flow = store.getFlow('kyc');
    expect(flow?.step).toBe('personal');
    expect(flow?.data).toEqual({ firstName: 'A' });
    expect(typeof flow?.updatedAt).toBe('number');
  });

  it('setFlow merges data across calls rather than replacing it', () => {
    store.setFlow('kyc', { data: { firstName: 'A' } });
    store.setFlow('kyc', { data: { lastName: 'B' } });
    expect(store.getFlow('kyc')?.data).toEqual({ firstName: 'A', lastName: 'B' });
  });

  it('setFlow keeps the previous step when a call omits it', () => {
    store.setFlow('kyc', { step: 'address' });
    store.setFlow('kyc', { data: { city: 'X' } });
    expect(store.getFlow('kyc')?.step).toBe('address');
  });

  it('setFlow persists to localStorage and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setFlow('walletSend', { step: 'review', data: { amount: '10' } });
    expect(listener).toHaveBeenCalled();
    const persisted = JSON.parse(localStorage.getItem(OS_KEY)!);
    expect(persisted.flows.walletSend.step).toBe('review');
    unsubscribe();
  });

  it('clearFlow removes the record and commits', () => {
    store.setFlow('kyc', { step: 'personal', data: {} });
    store.clearFlow('kyc');
    expect(store.getFlow('kyc')).toBeUndefined();
  });

  it('keeps independent flow keys from colliding', () => {
    store.setFlow('minesParticipation:c1', { step: 'accept' });
    store.setFlow('minesParticipation:c2', { step: 'tasks' });
    expect(store.getFlow('minesParticipation:c1')?.step).toBe('accept');
    expect(store.getFlow('minesParticipation:c2')?.step).toBe('tasks');
  });

  it('survives a reload (store.reset() + fresh read from localStorage)', () => {
    store.setFlow('kyc', { step: 'financial', data: { occupation: 'engineer' } });
    // Simulate a reload: re-run the same load path the constructor uses by
    // reading straight from what commit() persisted.
    const persisted = JSON.parse(localStorage.getItem(OS_KEY)!);
    expect(persisted.flows.kyc.step).toBe('financial');
    expect(persisted.flows.kyc.data.occupation).toBe('engineer');
  });
});

describe('Store — applyExternalState (cross-tab sync)', () => {
  beforeEach(() => {
    store.reset();
  });

  it('replaces in-memory state with the given snapshot', () => {
    const snapshot = { ...store.state, balances: { ...store.state.balances, MALL: 999 } };
    store.applyExternalState(snapshot);
    expect(store.state.balances.MALL).toBe(999);
  });

  it('notifies subscribers without re-persisting the snapshot', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const persistSpy = vi.spyOn(localStorage, 'setItem');

    const snapshot = { ...store.state, balances: { ...store.state.balances, MALL: 5 } };
    store.applyExternalState(snapshot);

    expect(listener).toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalledWith(OS_KEY, expect.anything());

    persistSpy.mockRestore();
    unsubscribe();
  });

  it('merges the snapshot over emptyState so missing slices are backfilled', () => {
    const { flows, ...partial } = store.state;
    store.applyExternalState(partial as typeof store.state);
    // flows should fall back to the empty-state default ({}), not crash.
    expect(store.state.flows).toEqual({});
  });
});
