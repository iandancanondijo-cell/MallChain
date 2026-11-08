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

/** Signed text for proving ownership before linking a wallet address to an account. */
function linkWalletMessage(address, timestamp) {
  return `Link wallet ${address} to my Mallchain account at ${timestamp}`;
}

/** Signed text for proving ownership before a socket subscribes to a wallet's live updates. */
function subscribeWalletMessage(address, timestamp) {
  return `Subscribe to live updates for ${address} at ${timestamp}`;
}

/**
 * Verifies a signature proves control of `address` for this specific
 * `message`. Two things must both hold:
 *  1. The signature is cryptographically valid over the exact signed doc.
 *  2. The pubkey that produced it actually derives to `address` under
 *     `addressPrefix` — otherwise a valid signature from ANY wallet could
 *     be replayed to "authorize" an action for someone else's address.
 */
function verifyOwnershipSignature({ address, message, pubKeyBase64, signatureBase64, addressPrefix }) {
  if (!address || !message || !pubKeyBase64 || !signatureBase64 || !addressPrefix) return false;

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
    const signDoc = buildSignDoc(address, message);
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

/** Back-compat wrapper — same as before for mallpoints.js's convert flow. */
function verifyConvertSignature({ address, timestamp, pubKeyBase64, signatureBase64, addressPrefix }) {
  if (!timestamp) return false;
  return verifyOwnershipSignature({
    address,
    message: convertMessage(address, timestamp),
    pubKeyBase64,
    signatureBase64,
    addressPrefix,
  });
}

function verifyLinkWalletSignature({ address, timestamp, pubKeyBase64, signatureBase64, addressPrefix }) {
  if (!timestamp) return false;
  return verifyOwnershipSignature({
    address,
    message: linkWalletMessage(address, timestamp),
    pubKeyBase64,
    signatureBase64,
    addressPrefix,
  });
}

function verifySubscribeWalletSignature({ address, timestamp, pubKeyBase64, signatureBase64, addressPrefix }) {
  if (!timestamp) return false;
  return verifyOwnershipSignature({
    address,
    message: subscribeWalletMessage(address, timestamp),
    pubKeyBase64,
    signatureBase64,
    addressPrefix,
  });
}

/**
 * Derive the bech32 addresses a signed transaction's signer infos prove
 * control of. Only secp256k1 pubkeys are considered (every Mallchain wallet
 * is secp256k1); anything unrecognized is skipped. Used by the send relay to
 * authorize broadcasts from wallets that aren't the account's linked wallet:
 * the single-group pubkey in a SignInfo IS the key that produced the
 * transaction signature, so a derived address here is cryptographic proof —
 * the same trust anchor as ADR-036 ownership verification, just read off the
 * broadcast payload instead of a separate handshake.
 */
function signerAddressesFromPubkeys(signerPubkeysBase64, addressPrefix) {
  const out = [];
  for (const b64 of signerPubkeysBase64 || []) {
    try {
      const bytes = fromBase64(b64);
      // uncompressed secp256k1 keys (33-65 bytes with 0x02/0x03 prefix) are
      // what we issue; anything else isn't a wallet key we recognize.
      if (bytes.length !== 33 || (bytes[0] !== 0x02 && bytes[0] !== 0x03)) continue;
      out.push(pubkeyToAddress(encodeSecp256k1Pubkey(bytes), addressPrefix));
    } catch (_) { /* unparseable pubkey — ignore this signer */ }
  }
  return out;
}

module.exports = {
  verifyOwnershipSignature,
  verifyConvertSignature,
  verifyLinkWalletSignature,
  verifySubscribeWalletSignature,
  signerAddressesFromPubkeys,
  convertMessage,
  linkWalletMessage,
  subscribeWalletMessage,
};
