/**
 * Session-tier flow persistence.
 *
 * Mirrors the durable tier's shape (store.setFlow/getFlow/clearFlow) but is
 * deliberately disjoint from the localStorage-backed `store`: sessionStorage
 * survives a same-tab reload but is cleared on tab close and is never shared
 * across tabs. Used for sensitive wizard data (KYC PII, mnemonics, PIN/private
 * key flows) that should be resumable within a session but must not sit in
 * localStorage or sync to other tabs.
 */

const PREFIX = 'mallchain_session_draft_v14:';

export interface SessionDraft<T> {
  step: string;
  data: T;
  updatedAt: number;
}

export function getSessionDraft<T>(key: string): SessionDraft<T> | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as SessionDraft<T>) : undefined;
  } catch {
    return undefined;
  }
}

export function setSessionDraft<T extends Record<string, unknown>>(
  key: string,
  patch: { step?: string; data?: Partial<T> }
): void {
  const cur = getSessionDraft<T>(key);
  const next: SessionDraft<T> = {
    step: patch.step ?? cur?.step ?? '',
    data: { ...(cur?.data as object ?? {}), ...(patch.data ?? {}) } as T,
    updatedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    /* storage full/unavailable */
  }
}

export function clearSessionDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
