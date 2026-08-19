const { makeSignDoc, serializeSignDoc, pubkeyToAddress, encodeSecp256k1Pubkey } = require('@cosmjs/amino');
const { Secp256k1, Secp256k1Signature, Sha256 } = require('@cosmjs/crypto');
const { fromBase64, toBase64, toUtf8 } = require('@cosmjs/encoding');

/**
 * ADR-036 "off-chain" arbitrary-message signing: the standard StdSignDoc
 * shape with chain_id/account_number/sequence/fee all zeroed out and a
 * single sign/MsgSignData message — the same convention Keplr/cosmjs's
 * signArbitrary uses. Nothing here is broadcast on-chain; it only proves
 * the caller holds the private key for `signerAddress`.
 */
function buildSignDoc(signerAddress, messageText) {
  const msg = {
    type: 'sign/MsgSignData',
    value: {
      signer: signerAddress,
      data: toBase64(toUtf8(messageText)),
    },
  };
  return makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
}

/** The exact text that gets signed — must match the frontend byte-for-byte. */
function convertMessage(address, timestamp) {
  return `Convert Mallpoints to Mallcoin for ${address} at ${timestamp}`;
}

/**
 * Verifies a signature proves control of `address` for this specific
 * convert request. Two things must both hold:
 *  1. The signature is cryptographically valid over the exact signed doc.
 *  2. The pubkey that produced it actually derives to `address` under
 *     `addressPrefix` — otherwise a valid signature from ANY wallet could
 *     be replayed to "authorize" a conversion for someone else's address.
 */
function verifyConvertSignature({ address, timestamp, pubKeyBase64, signatureBase64, addressPrefix }) {
  if (!address || !timestamp || !pubKeyBase64 || !signatureBase64 || !addressPrefix) return false;

  let pubkeyBytes;
  let signatureBytes;
  try {
    pubkeyBytes = fromBase64(pubKeyBase64);
    signatureBytes = fromBase64(signatureBase64);
  } catch (err) {
    return false;
  }
  if (signatureBytes.length !== 64) return false;

  try {
    const signDoc = buildSignDoc(address, convertMessage(address, timestamp));
    const serialized = serializeSignDoc(signDoc);
    const hash = new Sha256(serialized).digest();

    const signature = Secp256k1Signature.fromFixedLength(signatureBytes);
    if (!Secp256k1.verifySignature(signature, hash, pubkeyBytes)) return false;

    const derivedAddress = pubkeyToAddress(encodeSecp256k1Pubkey(pubkeyBytes), addressPrefix);
    return derivedAddress === address;
  } catch (err) {
    return false;
  }
}

module.exports = { verifyConvertSignature, convertMessage };
