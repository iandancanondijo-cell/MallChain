#!/usr/bin/env node
const { Secp256k1HdWallet } = require('@cosmjs/amino');
const { makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');

const MNEMONIC = 'danger mean super fitness notable taste neck submit cannon flame busy insect various rhythm parade caught bag inhale ahead cement purpose fee audit wait';
const ADDRESS = 'mall10v344vk27p8hn2xf0srz2eh43nadl8awrgyqvf';

async function main() {
  const wallet = await Secp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: 'mall' });

  const timestamp = new Date().toISOString();
  const message = `Convert Mallpoints to Mallcoin for ${ADDRESS} at ${timestamp}`;

  const msg = {
    type: 'sign/MsgSignData',
    value: {
      signer: ADDRESS,
      data: toBase64(toUtf8(message)),
    },
  };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
  const result = await wallet.signAmino(ADDRESS, signDoc);

  console.log(JSON.stringify({
    address: ADDRESS,
    timestamp,
    pubKey: result.signature.pub_key.value,
    signature: result.signature.signature,
  }, null, 2));
}

main().catch(console.error);
