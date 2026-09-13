/**
 * bip39 (and other legacy Node-oriented crypto/encoding libs pulled in via
 * @cosmjs) call Buffer.from(...) directly rather than using Uint8Array.
 * Node always provides a global Buffer; browsers never do, and Vite (unlike
 * webpack) does not auto-polyfill Node built-ins. Without this, bip39's
 * mnemonicToEntropy throws "Cannot read properties of undefined (reading
 * 'from')" on every single call — and validateMnemonic's own try/catch
 * silently swallows that into a plain `false`, indistinguishable from a
 * genuinely invalid mnemonic. Must be imported before anything that can
 * reach bip39 (first import in main.tsx).
 */
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
