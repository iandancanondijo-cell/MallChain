import assert from 'assert'
import { generateMnemonic, encryptKeystore, decryptKeystore } from './wallet.js'

async function run() {
  console.log('Keystore: generate mnemonic')
  const m = generateMnemonic()
  const pwd = 'correct horse battery staple'

  console.log('Keystore: encrypt')
  const ser = await encryptKeystore(m, pwd, { iterations: 200000 })
  assert(typeof ser === 'string', 'serialized keystore')

  console.log('Keystore: decrypt')
  const parsed = await decryptKeystore(ser, pwd)
  assert(parsed && parsed.mnemonic === m, 'decrypted mnemonic matches')

  console.log('Keystore roundtrip OK')
}

run().catch((err) => { console.error(err); process.exitCode = 1 })
