// The allowlist every Mines link write path and every renderer must agree on.
// These are the exact inputs a submitter or campaign creator can store, so the
// refusals matter more than the accepts: a value that passes here can reach an
// <a href> in a reviewer's or admin's browser (see frontend
// src/services/proofLink.ts, which mirrors this file).
const {
  isSafeExternalUrl,
  looksLikeLocalProofRef,
  localProofRefOwnedBy,
  assertStorableProofUrl,
  assertStorableContentLink,
  MAX_LINK_LENGTH,
} = require('../utils/linkPolicy');

const UID = 'a1b2c3d4e5f60718293a';
const OWNED_REF = `${UID}-1730000000000-screenshot.png`;

describe('isSafeExternalUrl', () => {
  test.each([
    'https://x.com/mallchain/status/1',
    'http://localhost:3000/task',
    '  https://instagram.com/p/abc  ',
  ])('accepts %s', (value) => {
    expect(isSafeExternalUrl(value)).toBe(true);
  });

  test.each([
    ['javascript:', 'javascript:alert(1)'],
    ['JavaScript: casing + whitespace', '  JavaScript:alert(document.cookie)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['bare relative', '/api/mines/proof/x.png'],
    ['protocol-relative', '//evil.example/x'],
    ['prose', 'see my tweet'],
    ['non-string', 42],
  ])('refuses %s', (_label, value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });

  test('refuses a URL with no hostname', () => {
    expect(isSafeExternalUrl('http://')).toBe(false);
  });

  test('refuses anything over the storage cap', () => {
    const tooLong = `https://a.example/${'x'.repeat(MAX_LINK_LENGTH)}`;
    expect(isSafeExternalUrl(tooLong)).toBe(false);
  });
});

describe('looksLikeLocalProofRef / localProofRefOwnedBy', () => {
  test('accepts the shape POST /api/mines/upload returns', () => {
    expect(looksLikeLocalProofRef(OWNED_REF)).toBe(true);
    expect(localProofRefOwnedBy(OWNED_REF, UID)).toBe(true);
  });

  test('accepts a jpg/jpeg extension and a sanitized original name', () => {
    expect(looksLikeLocalProofRef(`${UID}-1730000000000-IMG_0093.JPG`)).toBe(true);
    expect(looksLikeLocalProofRef(`${UID}-1730000000000-Screenshot_2026-11-09.jpeg`)).toBe(true);
  });

  test('refuses a ref belonging to another account', () => {
    expect(localProofRefOwnedBy(OWNED_REF, 'ffffffffffffffffffff')).toBe(false);
  });

  // The path-traversal case the ownership prefix alone does not catch: the
  // value still starts with `${userId}-`, so without the separator exclusion
  // it would be resolved by path.join() outside PROOFS_UPLOAD_DIR.
  // Built with char codes because a literal backslash in a source string is
  // easy to misread — the assertion must be about the real separator byte.
  const SEP = String.fromCharCode(92);
  test.each([
    ['forward slashes', `${UID}-1730-a/../../../etc/passwd.png`],
    ['backslashes', `${UID}-1730-a${SEP}..${SEP}..${SEP}windows${SEP}system32${SEP}config.png`],
  ])('refuses a ref carrying %s', (_label, value) => {
    expect(looksLikeLocalProofRef(value)).toBe(false);
    expect(localProofRefOwnedBy(value, UID)).toBe(false);
    expect(() => assertStorableProofUrl(value, { userId: UID })).toThrow(/must be either/);
  });

  // A `%2f` is not a filesystem separator, so it cannot traverse — it just
  // names a file that does not exist, which the on-disk check refuses.
  test('refuses an encoded-separator ref because it was never uploaded', () => {
    expect(() =>
      assertStorableProofUrl(`${UID}-1730-a%2f..%2fpasswd.png`, {
        userId: UID,
        proofExistsOnDisk: () => false,
      })
    ).toThrow(/not found on disk/);
  });

  test('refuses a short id prefix and a non-image extension', () => {
    expect(looksLikeLocalProofRef('abc-1730-x.png')).toBe(false);
    expect(looksLikeLocalProofRef(`${UID}-1730-notes.txt`)).toBe(false);
  });
});

describe('assertStorableProofUrl', () => {
  test('returns an owned ref unchanged apart from trimming', () => {
    expect(assertStorableProofUrl(`  ${OWNED_REF}  `, { userId: UID })).toBe(OWNED_REF);
  });

  test('returns a safe external URL', () => {
    expect(assertStorableProofUrl('https://x.com/i/status/1', { userId: UID })).toBe('https://x.com/i/status/1');
  });

  test('requires the proof field to be present', () => {
    expect(() => assertStorableProofUrl('', { userId: UID })).toThrow(/proof_url is required/);
    expect(() => assertStorableProofUrl(undefined, { userId: UID })).toThrow(/proof_url is required/);
  });

  test('refuses another user uploaded screenshot', () => {
    expect(() => assertStorableProofUrl(OWNED_REF, { userId: 'ffffffffffffffffffff' })).toThrow(
      /not uploaded by this account/
    );
  });

  test('refuses a ref that is not on disk when the caller can check', () => {
    expect(() =>
      assertStorableProofUrl(OWNED_REF, { userId: UID, proofExistsOnDisk: () => false })
    ).toThrow(/not found on disk/);
    expect(() =>
      assertStorableProofUrl(OWNED_REF, { userId: UID, proofExistsOnDisk: () => true })
    ).not.toThrow();
  });

  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    `${UID}-1730-a/../../../etc/passwd.png`,
    'uploads/' + OWNED_REF,
    'some screenshot i think',
  ])('refuses %s', (value) => {
    expect(() => assertStorableProofUrl(value, { userId: UID })).toThrow(/must be either/);
  });

  test('thrown messages are safe to surface to the submitter', () => {
    // routes/mines.js replies with error.message directly, so it must not echo
    // the attacker-controlled input back.
    const payload = 'javascript:alert(document.cookie)';
    try {
      assertStorableProofUrl(payload, { userId: UID });
      throw new Error('expected assertStorableProofUrl to throw');
    } catch (err) {
      expect(err.message).not.toContain(payload);
    }
  });
});

describe('assertStorableContentLink', () => {
  test('returns the trimmed URL', () => {
    expect(assertStorableContentLink('  https://instagram.com/mallchain  ')).toBe('https://instagram.com/mallchain');
  });

  test('requires a link', () => {
    expect(() => assertStorableContentLink(null)).toThrow(/content_link is required/);
  });

  // A campaign link is opened by every participant, so it never gets to be an
  // uploaded-file ref — only a real http(s) address.
  test.each(['javascript:alert(1)', 'https://', OWNED_REF])('refuses %s', (value) => {
    expect(() => assertStorableContentLink(value)).toThrow(/must be an http\(s\) URL/);
  });
});
