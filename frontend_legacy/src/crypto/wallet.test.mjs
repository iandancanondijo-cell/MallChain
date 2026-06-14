import assert from 'assert'
import { generateEntropy, generateMnemonic, validateMnemonic, walletFromMnemonic } from './wallet.js'

async function run() {
  console.log('Test: generateEntropy (256 bits)')
  const e = generateEntropy(256)
  assert(e instanceof Uint8Array, 'entropy should be Uint8Array')
  assert(e.length === 32, 'entropy length 32 bytes')

  console.log('Test: generateMnemonic (24 words)')
  const m = generateMnemonic()
  assert(typeof m === 'string', 'mnemonic string')
  const words = m.trim().split(/\s+/)
  assert(words.length === 24, '24 words generated')
  assert(validateMnemonic(m), 'mnemonic validates')

  console.log('Test: walletFromMnemonic')
  const result = await walletFromMnemonic(m)
  assert(result && result.accounts && result.accounts.length > 0, 'accounts present')
  const account = result.accounts[0]
  console.log('  address:', account.address)
  if (!account.address.startsWith('mall')) {
    console.warn('  address does not start with mall (ok if custom prefix not configured)')
  }

  console.log('All wallet primitive tests passed')
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exitCode = 1
})
