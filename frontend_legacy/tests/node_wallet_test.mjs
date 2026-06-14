import path from 'path'
const walletPath = path.resolve(process.cwd(), 'src/utils/wallet.js')
const mod = await import('file://' + walletPath)
const { generateMnemonic, createKeystoreFromMnemonic, decryptKeystore, deriveCosmosAccountFromMnemonic } = mod

console.log('generating mnemonic...')
const m = generateMnemonic()
console.log('mnemonic sample:', m.split(' ').slice(0,6).join(' ') + '...')

console.log('creating keystore...')
const keystore = await createKeystoreFromMnemonic(m, 'node-test-pass')
console.log('keystore has address:', keystore.address)

console.log('decrypting keystore...')
const dec = await decryptKeystore(keystore, 'node-test-pass')
if(dec !== m) throw new Error('decrypted mnemonic mismatch')
console.log('decrypt ok')

console.log('deriving cosmos account...')
const acct = await deriveCosmosAccountFromMnemonic(m, 'mall')
console.log('derived account:', acct)

console.log('node wallet utilities test passed')
