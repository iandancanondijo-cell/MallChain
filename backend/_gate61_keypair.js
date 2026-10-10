// Gate 61.2 — Generate keypair, sign ADR-036, link wallet
const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');
const { writeFileSync } = require('fs');

(async () => {
  const wallet = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [account] = await wallet.getAccounts();
  const address = account.address;
  const pubKeyBase64 = toBase64(account.pubkey);

  console.log('=== GENERATED KEYPAIR ===');
  console.log('Address:', address);
  console.log('PubKey (base64):', pubKeyBase64);

  const timestamp = Date.now();
  const message = `Link wallet ${address} to my Mallchain account at ${timestamp}`;
  const msg = {
    type: 'sign/MsgSignData',
    value: {
      signer: address,
      data: toBase64(toUtf8(message)),
    },
  };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
  const signResult = await wallet.signAmino(address, signDoc);
  const signatureBase64 = signResult.signature.signature;

  console.log('\n=== SIGNATURE ===');
  console.log('Timestamp:', timestamp);
  console.log('Message:', message);
  console.log('Signature (base64):', signatureBase64);

  const data = { address, timestamp, pubKey: pubKeyBase64, signature: signatureBase64 };
  writeFileSync('/tmp/gate61/wallet_link.json', JSON.stringify(data, null, 2));
  console.log('\nSaved to /tmp/gate61/wallet_link.json');
  console.log('\nAPI body:');
  console.log(JSON.stringify({ address, timestamp, pubKey: pubKeyBase64, signature: signatureBase64 }));
})().catch(err => { console.error(err); process.exit(1); });
