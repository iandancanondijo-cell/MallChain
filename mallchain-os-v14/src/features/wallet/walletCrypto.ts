export interface VaultEntry {
  address: string;
  saltB64: string;
  ivB64: string;
  cipherB64: string;
  savedAt: number;
}

export const bufToB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
};

export const b64ToBuf = (str: string): Uint8Array => {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
};

export const deriveKey = async (pwd: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pwd),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptMnemonic = async (text: string, pwd: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pwd, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return {
    saltB64: bufToB64(salt),
    ivB64: bufToB64(iv),
    cipherB64: bufToB64(cipherBuf)
  };
};

export const decryptMnemonic = async (entry: VaultEntry, pwd: string): Promise<string> => {
  const key = await deriveKey(pwd, b64ToBuf(entry.saltB64));
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(entry.ivB64) as BufferSource },
    key,
    b64ToBuf(entry.cipherB64) as BufferSource
  );
  return new TextDecoder().decode(plainBuf);
};
