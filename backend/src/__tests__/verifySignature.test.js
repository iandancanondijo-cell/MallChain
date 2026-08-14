const crypto = require('crypto');
const verifySignature = require('../mallwallet/security/verifySignature');

describe('verifySignature', () => {
  let publicKey;
  let privateKey;

  beforeAll(() => {
    ({ publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }));
  });

  function sign(message) {
    const signer = crypto.createSign('SHA256');
    signer.update(message);
    signer.end();
    return signer.sign(privateKey, 'hex');
  }

  test('accepts a valid signature for the exact message', () => {
    const message = 'transfer 100 MLCNS to mall1recipient';
    const signature = sign(message);

    expect(verifySignature(message, signature, publicKey)).toBe(true);
  });

  test('rejects a signature when the message has been tampered with', () => {
    const signature = sign('transfer 100 MLCNS to mall1recipient');

    expect(verifySignature('transfer 100000 MLCNS to mall1recipient', signature, publicKey)).toBe(false);
  });

  test('rejects a valid signature verified against the wrong public key', () => {
    const { publicKey: otherPublicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const signature = sign('transfer 100 MLCNS to mall1recipient');

    expect(verifySignature('transfer 100 MLCNS to mall1recipient', signature, otherPublicKey)).toBe(false);
  });

  test('rejects a malformed (non-hex) signature rather than accepting it', () => {
    // Buffer.from(..., 'hex') parses leniently and stops at the first invalid byte
    // rather than throwing, so this must come back false, not true.
    expect(verifySignature('message', 'not-a-valid-hex-signature!!', publicKey)).toBe(false);
  });

  test('throws rather than silently accepting a malformed public key', () => {
    const signature = sign('message');
    expect(() => verifySignature('message', signature, 'not-a-pem-key')).toThrow();
  });
});
