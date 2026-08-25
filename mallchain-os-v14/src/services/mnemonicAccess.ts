/**
 * On-demand, PIN-gated mnemonic access.
 *
 * Mirrors ui.tsx's toast-bus pattern: requestMnemonic() emits a request that
 * <PinChallengeHost/> (mounted once in App.tsx) picks up, prompts the PIN,
 * decrypts store.state.wallet.pinEncryptedMnemonic, and resolves the
 * caller's promise with the plaintext phrase — which the caller must use
 * immediately and let go out of scope, never store it. Replaces every
 * direct `st.wallet.mnemonic` read across the app's signing surfaces (Send,
 * Stake, Vote, Marketplace, Mallpoints, Validator apply): the plaintext
 * mnemonic is no longer persisted at all (see store.ts / App.tsx's
 * migration effect), so this is the only way to get it back.
 */

export interface MnemonicRequest {
  resolve: (mnemonic: string | null) => void;
}

export const mnemonicRequestBus = {
  listeners: new Set<(req: MnemonicRequest) => void>(),
};

/** Resolves with the decrypted mnemonic, or null if the user cancels. */
export function requestMnemonic(): Promise<string | null> {
  return new Promise((resolve) => {
    if (mnemonicRequestBus.listeners.size === 0) {
      // No <PinChallengeHost/> mounted (shouldn't happen outside tests) —
      // fail safe rather than hang forever.
      resolve(null);
      return;
    }
    mnemonicRequestBus.listeners.forEach((fn) => fn({ resolve }));
  });
}
