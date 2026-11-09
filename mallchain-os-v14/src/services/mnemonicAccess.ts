/**
 * On-demand, cipher-gated mnemonic access.
 *
 * Mirrors ui.tsx's toast-bus pattern: requestMnemonic() emits a request that
 * <CipherChallengeHost/> (mounted once in App.tsx) picks up, shows the Crypt
 * Cipher Wall, verifies the tapped glyph sequence (or a legacy digit PIN)
 * server-side, decrypts store.state.wallet.pinEncryptedMnemonic, and resolves
 * the caller's promise with the plaintext phrase — which the caller must use
 * immediately and let go out of scope, never store it. Replaces every
 * direct `st.wallet.mnemonic` read across the app's signing surfaces (Send,
 * Stake, Vote, Marketplace, Mallpoints, Validator apply): the plaintext
 * mnemonic is no longer persisted at all (see store.ts / CipherChallenge.tsx's
 * legacy-cipher enrollment), so this is the only way to get it back.
 * It is also the migration gate: a pre-secret-gating account whose phrase is
 * still plaintext on this device gets the "choose your cipher" wall here, at
 * the wallet action, instead of having the rest of the app interrupted.
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
      // No <CipherChallengeHost/> mounted (shouldn't happen outside tests) —
      // fail safe rather than hang forever.
      resolve(null);
      return;
    }
    mnemonicRequestBus.listeners.forEach((fn) => fn({ resolve }));
  });
}
