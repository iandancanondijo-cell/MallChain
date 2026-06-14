// Minimal Mallcoin address validator used by the frontend.
// Returns an object { valid: boolean, error?: string }

export function isValidMallcoinAddress(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'Empty address' }
  let addr = raw.trim()
  if (addr.startsWith('mallcoin:')) addr = addr.slice(9)
  // Accept bech32 (mall...) or hex (0x...) or any 40-64 char alphanumeric
  if (/^mall[a-z0-9]{10,64}$/i.test(addr)) return { valid: true }
  if (/^0x[0-9a-fA-F]{40,64}$/.test(addr)) return { valid: true }
  if (/^[a-zA-Z0-9]{40,64}$/.test(addr)) return { valid: true }
  return { valid: false, error: 'Address must be bech32, hex, or 40-64 alphanumeric' }
}

export default isValidMallcoinAddress
