/**
 * Cross-tab sync has one decision in it that can cost a person their session:
 * what to do with a whole-state snapshot another same-origin tab just wrote to
 * OS_KEY. Observed in this workspace: a published copy of the app served under
 * /downloads/node/ shared the origin with the dev server, wrote its own
 * (signed-out) snapshot, and the bell and dashboard of a verified tab fell back
 * to nobody — while /api/auth/me kept reporting the real user. Ordinary state
 * still merges last-write-wins; only a snapshot that disagrees about *who is
 * signed in* is refused.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store, OS_KEY, type AppState } from '../store/store';
import { authService } from './auth';
import { storeSync } from './storeSync';

const VERIFIED_ID = 'tab-a-user';

/** A snapshot as the other tab would serialize it, editable before it ships. */
function snapshot(mutate: (s: AppState) => void): string {
  const copy = JSON.parse(JSON.stringify(store.state)) as AppState;
  mutate(copy);
  return JSON.stringify(copy);
}

function emit(newValue: string | null): void {
  window.dispatchEvent(new StorageEvent('storage', { key: OS_KEY, newValue }));
}

describe('storeSync — snapshots from another tab', () => {
  beforeEach(() => {
    localStorage.clear();
    store.reset();
    // A live session marker is what lets initialize() keep user.authed true;
    // without it the periodic sync signs this tab out before the event lands.
    authService.setSession(Math.floor(Date.now() / 1000) + 3600);
    store.state.user.authed = true;
    store.state.user.id = VERIFIED_ID;
    store.commit();
    storeSync.initialize();
  });

  afterEach(() => {
    storeSync.cleanup();
    store.reset();
    localStorage.clear();
  });

  it('takes balances and wallet from a tab signed in as the same account', () => {
    const before = store.state.balances.MALL;
    emit(snapshot((s) => {
      s.balances.MALL = before + 500;
      s.wallet.address = 'mall1sameaccountaddressxxxxxxxxxxxxxxxxxxxxx';
    }));

    expect(store.state.balances.MALL).toBe(before + 500);
    expect(store.state.wallet.address).toBe('mall1sameaccountaddressxxxxxxxxxxxxxxxxxxxxx');
    expect(store.state.user.id).toBe(VERIFIED_ID);
  });

  it('refuses a snapshot from a tab signed in as a different account', () => {
    const address = 'mall1thisaccountsaddressxxxxxxxxxxxxxxxxxxxx';
    store.state.wallet.address = address;
    store.commit();

    emit(snapshot((s) => {
      s.user.id = 'tab-b-user';
      s.user.authed = true;
      s.balances.MALL = 999_999;
      s.wallet.address = 'mall1tabbaddressxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    }));

    expect(store.state.user.id).toBe(VERIFIED_ID);
    expect(store.state.balances.MALL).not.toBe(999_999);
    expect(store.state.wallet.address).toBe(address);
  });

  it('still mirrors a logout from another tab', () => {
    // A signed-out snapshot is not another account, it is the same person
    // finishing their session somewhere else.
    emit(snapshot((s) => {
      s.user.id = '';
      s.user.authed = false;
    }));

    expect(store.state.user.id).toBe('');
    expect(store.state.user.authed).toBe(false);
  });

  it('lets a tab with no verified identity adopt the account it is told about', () => {
    // The usual case for a second tab that opened before anyone signed in:
    // the other tab is the source of truth, so its snapshot applies whole.
    store.state.user.authed = false;
    store.state.user.id = '';
    store.commit();

    emit(snapshot((s) => {
      s.user.id = 'first-account';
      s.user.authed = true;
      s.balances.MALL = 42;
    }));

    expect(store.state.user.id).toBe('first-account');
    expect(store.state.balances.MALL).toBe(42);
  });

  it('clears local state when another tab removes the document entirely', () => {
    store.state.balances.MALL = 12;
    store.commit();

    emit(null);

    expect(store.state.user.id).toBe('');
    expect(store.state.balances.MALL).toBe(0);
  });
});
